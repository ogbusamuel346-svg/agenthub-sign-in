import { config as loadEnv } from 'dotenv';
import express, { type NextFunction, type Request, type Response } from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer as createViteServer } from 'vite';
import { requireFirebaseUser, type AuthenticatedRequest } from './authMiddleware';
import { FirebaseAdminConfigError } from './firebaseAdmin';
import { createExamRouter } from './examRoutes';
import {
  assertPurchaseInfrastructure,
  assertSupplierToken,
  callTopupmateApi,
  getSupplierTransactionStatus,
  getTopupmateTransaction,
  normalizeDataPlans,
  normalizeNetworks,
  normalizeSupplierBalance,
  normalizeUtilityProviders,
  normalizePhone,
  requireDocumentedPurchaseBody,
  requireJsonObject,
  requirePositiveNumber,
  requireString,
  TopupmateApiError,
  supplierConfigStatus,
} from './smeApi';
import {
  getExamTransaction,
  listExamTransactions,
  refundExamTransaction,
  ServiceTransactionError,
  updateExamTransaction,
} from './serviceTransactions';
import {
  createWalletFunding,
  getWalletBalance,
  getWalletFundingStatus,
  reconcileWalletFunding,
  recordFlutterwaveWebhookEvent,
  WalletError,
} from './wallet';
import { isValidFlutterwaveWebhookSignature, makeWebhookEventKey } from './walletSecurity';

const projectRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
loadEnv({ path: path.join(projectRoot, '.env.local') });
loadEnv({ path: path.join(projectRoot, '.env') });
const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '64kb' }));

function sendError(res: Response, error: unknown) {
  if (error instanceof TopupmateApiError) {
    res.status(error.status).json({ error: { code: error.code, message: error.message, ...(error.details === undefined ? {} : { details: error.details }) } });
    return;
  }
  if (error instanceof WalletError) {
    res.status(error.status).json({ error: { code: error.code, message: error.message } });
    return;
  }
  if (error instanceof ServiceTransactionError) {
    res.status(error.status).json({ error: { code: error.code, message: error.message } });
    return;
  }
  if (error instanceof FirebaseAdminConfigError) {
    res.status(503).json({ error: { code: 'FIREBASE_SERVER_NOT_CONFIGURED', message: error.message } });
    return;
  }
  if (typeof error === 'object' && error !== null && 'type' in error && (error as { type?: unknown }).type === 'entity.parse.failed') {
    res.status(400).json({ error: { code: 'INVALID_JSON', message: 'Request body must contain valid JSON.' } });
    return;
  }
  console.error(error);
  res.status(500).json({ error: { code: 'INTERNAL_SERVER_ERROR', message: 'The server could not complete the request.' } });
}

function asyncRoute(handler: (req: Request, res: Response) => Promise<void>) {
  return (req: Request, res: Response, next: NextFunction) => {
    handler(req, res).catch(next);
  };
}

function requireCustomerPurchaseInfrastructure(_req: Request, _res: Response, next: NextFunction) {
  try {
    assertSupplierToken();
    assertPurchaseInfrastructure();
    next();
  } catch (error) {
    next(error);
  }
}

function validateRef(ref: string) {
  if (!/^[a-z0-9][a-z0-9_.:-]{5,120}$/i.test(ref)) throw new TopupmateApiError('ref must be 6–121 letters, numbers, dots, underscores, colons or hyphens.', 400, 'INVALID_REQUEST');
  return ref;
}

function getReferenceQuery(req: Request) {
  const reference = typeof req.query.reference === 'string' ? req.query.reference.trim() : '';
  if (!reference) throw new TopupmateApiError('reference is required.', 400, 'INVALID_REQUEST');
  return validateRef(reference);
}

function requireSupplierAdminToken(req: Request) {
  const expected = process.env.TOPUPMATE_ADMIN_VIEW_TOKEN?.trim();
  const supplied = req.get('x-topupmate-admin-token')?.trim();
  if (!expected) throw new TopupmateApiError('Supplier admin endpoints are disabled until TOPUPMATE_ADMIN_VIEW_TOKEN is configured.', 503, 'ADMIN_VIEW_NOT_CONFIGURED');
  if (!supplied || supplied !== expected) throw new TopupmateApiError('Not authorized to view supplier account data.', 401, 'UNAUTHORIZED');
}

function mapSupplierStatus(status: ReturnType<typeof getSupplierTransactionStatus>) {
  return status === 'processing' ? 'pending' : status;
}

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: 'SamEduHub API', supplier: supplierConfigStatus() });
});

function getAuthenticatedUser(req: Request) {
  const user = (req as AuthenticatedRequest).firebaseUser;
  if (!user?.uid) throw new WalletError('A verified Firebase account is required.', 401, 'AUTHENTICATION_REQUIRED');
  return { uid: user.uid, email: user.email || undefined, name: user.name || undefined };
}

app.get('/api/wallet', requireFirebaseUser, asyncRoute(async (req, res) => {
  const user = getAuthenticatedUser(req);
  res.json(await getWalletBalance(user.uid));
}));

app.post('/api/wallet/funding', requireFirebaseUser, asyncRoute(async (req, res) => {
  const user = getAuthenticatedUser(req);
  res.status(201).json(await createWalletFunding({ user, amount: req.body?.amount }));
}));

app.get('/api/wallet/funding/:txRef', requireFirebaseUser, asyncRoute(async (req, res) => {
  const user = getAuthenticatedUser(req);
  res.json(await getWalletFundingStatus(user.uid, req.params.txRef));
}));

app.get('/api/flutterwave/callback', asyncRoute(async (req, res) => {
  const txRef = typeof req.query.tx_ref === 'string' ? req.query.tx_ref : '';
  const transactionId = typeof req.query.transaction_id === 'string' ? req.query.transaction_id : '';
  if (!txRef || !transactionId) throw new WalletError('Flutterwave callback is missing tx_ref or transaction_id.', 400, 'INVALID_FLUTTERWAVE_CALLBACK');
  const result = await reconcileWalletFunding(txRef, transactionId);
  const frontendReturnUrl = process.env.FLW_FRONTEND_RETURN_URL?.trim();
  if (frontendReturnUrl) {
    const redirect = new URL(frontendReturnUrl);
    redirect.searchParams.set('wallet_tx_ref', result.txRef);
    redirect.searchParams.set('wallet_status', result.status);
    res.redirect(303, redirect.toString());
    return;
  }
  res.json(result);
}));

app.post('/api/flutterwave/webhook', asyncRoute(async (req, res) => {
  const signature = req.get('verif-hash');
  if (!isValidFlutterwaveWebhookSignature(signature, process.env.FLW_SECRET_HASH?.trim())) {
    res.status(401).end();
    return;
  }

  const payload = req.body as { event?: unknown; data?: { id?: unknown; tx_ref?: unknown; status?: unknown } };
  const event = typeof payload.event === 'string' ? payload.event : '';
  const data = payload.data;
  const transactionId = data && data.id !== undefined ? String(data.id) : '';
  const txRef = data && typeof data.tx_ref === 'string' ? data.tx_ref : '';
  const status = data && typeof data.status === 'string' ? data.status : '';
  if (!event || !transactionId || !txRef || !status) {
    res.status(200).end();
    return;
  }

  const eventKey = makeWebhookEventKey(event, transactionId, status);
  const result = await reconcileWalletFunding(txRef, transactionId);
  await recordFlutterwaveWebhookEvent(eventKey, { event, transactionId, txRef, status });
  res.status(200).json({ ok: true, status: result.status });
}));

app.get('/api/sme/dataplans', asyncRoute(async (_req, res) => {
  const payload = await callTopupmateApi('/services/?service=data', 'GET');
  res.json({ plans: normalizeDataPlans(payload), fetchedAt: new Date().toISOString() });
}));

app.get('/api/sme/networks', asyncRoute(async (_req, res) => {
  const payload = await callTopupmateApi('/services/?service=network', 'GET');
  res.json({ networks: normalizeNetworks(payload), fetchedAt: new Date().toISOString() });
}));

// TopupMate exam catalogue and purchase route.
app.use('/api/sme', createExamRouter());

app.get('/api/sme/electricity/providers', asyncRoute(async (_req, res) => {
  const payload = await callTopupmateApi('/services/?service=electricity', 'GET');
  res.json({ providers: normalizeUtilityProviders(payload), fetchedAt: new Date().toISOString() });
}));

app.get('/api/internal/sme/balance', asyncRoute(async (req, res) => {
  requireSupplierAdminToken(req);
  assertSupplierToken();
  const payload = await callTopupmateApi('/user/', 'GET');
  const balance = normalizeSupplierBalance(payload);
  res.json({ ...balance, supplier: payload });
}));

app.get('/api/internal/sme/transaction-status', asyncRoute(async (req, res) => {
  requireSupplierAdminToken(req);
  const reference = getReferenceQuery(req);
  const { supplier, providerStatus } = await getTopupmateTransaction(reference);
  res.json({ reference, status: mapSupplierStatus(providerStatus), providerStatus, checkedAt: new Date().toISOString(), supplier });
}));

app.post('/api/sme/airtime', requireFirebaseUser, requireCustomerPurchaseInfrastructure, asyncRoute(async (req, res) => {
  const { input, ref: generatedRef } = requireDocumentedPurchaseBody('airtime', req.body);
  const ref = validateRef(generatedRef);
  const network = input.network;
  if (typeof network !== 'number' && typeof network !== 'string') throw new TopupmateApiError('network must be the provider network ID.', 400, 'INVALID_REQUEST');
  const phone = normalizePhone(requireString(input, 'phone'));
  const amount = requirePositiveNumber(input, 'amount');
  const airtimeType = typeof input.airtime_type === 'string' && input.airtime_type.trim() ? input.airtime_type.trim() : 'VTU';
  if (airtimeType !== 'VTU' && airtimeType !== 'ShareNShare') throw new TopupmateApiError('airtime_type must be VTU or ShareNShare.', 400, 'INVALID_REQUEST');
  const payload = { network, amount, phone, airtime_type: airtimeType, ref };
  const supplier = await callTopupmateApi('/airtime/', 'POST', payload);
  res.status(202).json({ reference: ref, status: 'pending', supplier });
}));

app.post('/api/sme/data', requireFirebaseUser, requireCustomerPurchaseInfrastructure, asyncRoute(async (req, res) => {
  const { input, ref: generatedRef } = requireDocumentedPurchaseBody('data', req.body);
  const ref = validateRef(generatedRef);
  const network = input.network;
  const dataPlan = input.data_plan;
  if ((typeof network !== 'number' && typeof network !== 'string') || (typeof dataPlan !== 'number' && typeof dataPlan !== 'string')) {
    throw new TopupmateApiError('network and data_plan must be the live provider IDs returned by the TopupMate service catalogue.', 400, 'INVALID_REQUEST');
  }
  const phone = normalizePhone(requireString(input, 'phone'));
  const payload = { network, plan: dataPlan, phone, ref };
  const supplier = await callTopupmateApi('/data/', 'POST', payload);
  res.status(202).json({ reference: ref, status: 'pending', supplier });
}));

app.post('/api/sme/electricity/verify', requireFirebaseUser, asyncRoute(async (req, res) => {
  const body = requireJsonObject(req.body, 'A JSON request body is required.');
  if (!body.payload || typeof body.payload !== 'object' || Array.isArray(body.payload)) {
    throw new TopupmateApiError('Supply the provider-documented electricity verification payload under payload.', 400, 'INVALID_REQUEST');
  }
  assertSupplierToken();
  const supplier = await callTopupmateApi('/electricity/verify/', 'POST', body.payload);
  const supplierStatus = getSupplierTransactionStatus(supplier);
  if (supplierStatus !== 'successful') {
    throw new TopupmateApiError('TopupMate could not verify the electricity meter.', 502, 'ELECTRICITY_VERIFICATION_FAILED', supplier);
  }
  res.json({ supplier, status: supplierStatus });
}));

app.post('/api/sme/electricity', requireFirebaseUser, requireCustomerPurchaseInfrastructure, asyncRoute(async (req, res) => {
  const { input, ref: generatedRef } = requireDocumentedPurchaseBody('electricity', req.body);
  const ref = validateRef(generatedRef);
  const provider = input.provider;
  if (typeof provider !== 'number' && typeof provider !== 'string') throw new TopupmateApiError('provider must be the provider ID returned by the configured electricity catalogue.', 400, 'INVALID_REQUEST');
  const metertype = requireString(input, 'metertype').toLowerCase();
  if (metertype !== 'prepaid' && metertype !== 'postpaid') throw new TopupmateApiError('metertype must be prepaid or postpaid.', 400, 'INVALID_REQUEST');
  const meternumber = requireString(input, 'meternumber');
  const phone = normalizePhone(requireString(input, 'phone'));
  const amount = requirePositiveNumber(input, 'amount');
  const payload = { provider, metertype, meternumber, amount, phone, ref };
  const supplier = await callTopupmateApi('/electricity/', 'POST', payload);
  res.status(202).json({ reference: ref, status: 'pending', supplier });
}));

app.post('/api/sme/cabletv/verify', requireFirebaseUser, asyncRoute(async (req, res) => {
  const body = requireJsonObject(req.body, 'A JSON request body is required.');
  if (!body.payload || typeof body.payload !== 'object' || Array.isArray(body.payload)) {
    throw new TopupmateApiError('Supply the provider-documented cable verification payload under payload.', 400, 'INVALID_REQUEST');
  }
  assertSupplierToken();
  const supplier = await callTopupmateApi('/cable/verify/', 'POST', body.payload);
  res.json({ supplier });
}));

app.post('/api/sme/cabletv', requireFirebaseUser, requireCustomerPurchaseInfrastructure, asyncRoute(async (req, res) => {
  const { input, ref: generatedRef } = requireDocumentedPurchaseBody('cabletv', req.body);
  const ref = validateRef(generatedRef);
  const provider = input.provider;
  const plan = input.plan;
  if ((typeof provider !== 'number' && typeof provider !== 'string') || (typeof plan !== 'number' && typeof plan !== 'string')) throw new TopupmateApiError('provider and plan must be provider IDs from the configured cable catalogue.', 400, 'INVALID_REQUEST');
  const iucnumber = requireString(input, 'iucnumber');
  const phone = normalizePhone(requireString(input, 'phone'));
  const subtype = requireString(input, 'subtype');
  const payload = { provider, iucnumber, phone, plan, ref, subtype };
  const supplier = await callTopupmateApi('/cabletv/', 'POST', payload);
  res.status(202).json({ reference: ref, status: 'pending', supplier });
}));

app.get(['/api/sme/exam/history', '/api/sme/transactions'], requireFirebaseUser, asyncRoute(async (req, res) => {
  const user = getAuthenticatedUser(req);
  res.json({ transactions: await listExamTransactions(user.uid) });
}));

app.get('/api/sme/transaction-status', requireFirebaseUser, asyncRoute(async (req, res) => {
  const user = getAuthenticatedUser(req);
  const reference = getReferenceQuery(req);
  const existing = await getExamTransaction(user.uid, reference);
  if (!existing) throw new ServiceTransactionError('No transaction with this reference belongs to your account.', 404, 'TRANSACTION_NOT_FOUND');

  const { providerStatus } = await getTopupmateTransaction(reference);

  let transaction = existing;
  if (providerStatus === 'successful' && existing.status !== 'successful' && existing.status !== 'failed') {
    transaction = await updateExamTransaction(user.uid, reference, { status: 'successful', providerStatus });
  } else if (providerStatus === 'failed' && existing.status !== 'successful') {
    transaction = await refundExamTransaction(user.uid, reference, 'TOPUPMATE_PURCHASE_FAILED');
  } else if (providerStatus === 'processing' && existing.status === 'processing') {
    transaction = await updateExamTransaction(user.uid, reference, { status: 'pending', providerStatus });
  }

  res.json({ reference, status: transaction.status, providerStatus, transaction, checkedAt: new Date().toISOString() });
}));

// The Express development server must not serve the SPA HTML as a successful
// response for Cloudflare routes that it does not implement.
app.use('/api/cloudflare', (_req, res) => {
  res.status(503).json({ error: { code: 'CLOUDFLARE_WORKER_NOT_RUNNING', message: 'This Cloudflare API route is unavailable on the Express server. Start the Wrangler Worker to use it.' } });
});

app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => sendError(res, error));

const cliPortIndex = process.argv.findIndex((argument) => argument === '--port');
const cliPort = cliPortIndex >= 0 ? Number(process.argv[cliPortIndex + 1]) : undefined;
const port = Number(process.env.PORT || cliPort || 3000);
const isProduction = process.env.NODE_ENV === 'production';

if (isProduction) {
  app.use(express.static(path.join(projectRoot, 'dist')));
  app.get('*', (_req, res) => res.sendFile(path.join(projectRoot, 'dist', 'index.html')));
} else {
  const vite = await createViteServer({ root: projectRoot, configLoader: 'native', server: { middlewareMode: true }, appType: 'spa' });
  app.use(vite.middlewares);
}

app.listen(port, '0.0.0.0', () => {
  console.log(`SamEduHub server listening on http://localhost:${port}`);
});
