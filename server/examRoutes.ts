import { Router, type RequestHandler } from 'express';
import { requireFirebaseUser, type AuthenticatedRequest } from './authMiddleware';
import {
  assertPurchaseInfrastructure, assertSupplierToken, callTopupmateApi, extractExamPins,
  getSupplierTransactionStatus, normalizeExamProducts, requireDocumentedPurchaseBody,
  requirePositiveInteger, TopupmateApiError,
} from './smeApi';
import { beginExamTransaction, refundExamTransaction, updateExamTransaction } from './serviceTransactions';

// Keep the existing purchase hold until wallet/recovery checks have been completed.
// Restoring the supplier does not authorize enabling customer charges.
function assertExamPurchasesReady(): void {
  throw new TopupmateApiError('Exam PIN purchases are temporarily unavailable. Your wallet has not been charged.', 503, 'EXAM_PURCHASES_DISABLED');
}

export function createExamRouter(dependencies: {
  authenticate?: RequestHandler;
  supplier?: typeof callTopupmateApi;
} = {}) {
  const router = Router();
  const authenticate = dependencies.authenticate || requireFirebaseUser;
  const supplier = dependencies.supplier || callTopupmateApi;
  router.get('/exampins', async (_req, res, next) => {
    try {
      const payload = await supplier('/services/?service=exampin', 'GET');
      res.json({ products: normalizeExamProducts(payload), fetchedAt: new Date().toISOString(), provider: 'topupmate', purchaseEnabled: false });
    } catch {
      next(new TopupmateApiError('The TopupMate exam catalogue could not be loaded. Please try again later.', 502, 'EXAM_CATALOGUE_UNAVAILABLE'));
    }
  });
  router.post('/exam', authenticate, async (req, res, next) => {
    try {
      const user = (req as AuthenticatedRequest).firebaseUser;
      if (!user?.uid) throw new TopupmateApiError('Please sign in before purchasing.', 401, 'AUTHENTICATION_REQUIRED');
      assertExamPurchasesReady();
      assertSupplierToken();
      assertPurchaseInfrastructure();
      const { input, ref } = requireDocumentedPurchaseBody('exam', req.body);
      if (!/^[a-z0-9][a-z0-9_.:-]{5,120}$/i.test(ref)) throw new TopupmateApiError('Invalid order reference.', 400, 'INVALID_REQUEST');
      const quantity = requirePositiveInteger(input, 'quantity');
      const products = normalizeExamProducts(await supplier('/services/?service=exampin', 'GET'));
      const product = products.find(item => String(item.id) === String(input.provider));
      if (!product?.available || product.price === null || product.price <= 0) throw new TopupmateApiError('The selected exam product is unavailable.', 409, 'PRODUCT_NOT_AVAILABLE');
      const transaction = await beginExamTransaction({ uid: user.uid, reference: ref, providerId: product.id,
        providerName: product.provider, quantity, unitPriceMinor: Math.round(product.price * 100) });
      if (!transaction.created) {
        const record = transaction.record;
        res.json({ reference: ref, status: record.status, product: { id: record.providerId, provider: record.providerName },
          quantity: record.quantity, unitPrice: record.unitPriceMinor / 100, totalAmount: record.totalAmountMinor / 100,
          pins: record.pins || [], message: 'This order reference has already been recorded.' });
        return;
      }
      let payload: unknown;
      try {
        payload = await supplier('/exampin/', 'POST', { provider: product.id, quantity, ref });
      } catch {
        // A failed connection may still have produced an accepted supplier order.
        await updateExamTransaction(user.uid, ref, { status: 'pending', failureCode: 'SUPPLIER_OUTCOME_UNCERTAIN' });
        throw new TopupmateApiError('Your order is awaiting confirmation. Check its status before purchasing again.', 503, 'EXAM_RECONCILIATION_REQUIRED');
      }
      const providerStatus = getSupplierTransactionStatus(payload);
      if (providerStatus === 'failed') {
        await refundExamTransaction(user.uid, ref, 'TOPUPMATE_PURCHASE_FAILED');
        throw new TopupmateApiError('The exam order failed. Your wallet was refunded.', 502, 'TOPUPMATE_PURCHASE_FAILED');
      }
      const pins = extractExamPins(payload);
      const status = providerStatus === 'successful' ? 'successful' : 'pending';
      await updateExamTransaction(user.uid, ref, { status, providerStatus, ...(pins.length ? { pins } : {}) });
      res.status(status === 'successful' ? 200 : 202).json({ reference: ref, status,
        product: { id: product.id, provider: product.provider }, quantity, unitPrice: product.price,
        totalAmount: product.price * quantity, pins,
        message: pins.length ? 'Exam PINs were delivered by TopupMate.' : 'Your exam order is awaiting confirmation.' });
    } catch (error) { next(error); }
  });
  return router;
}
