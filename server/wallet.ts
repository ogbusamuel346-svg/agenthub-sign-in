import { randomBytes } from 'node:crypto';
import { getFirebaseAdminDatabase } from './firebaseAdmin';
import { verifyPaystackTransaction as verifySharedPaystackTransaction } from '../shared/paystack';
import {
  applyWalletFundingClaim,
  walletFundingLedgerEntry,
  parseAmountToMinor,
  requireCustomerEmail,
  validateSuccessfulPaystackTransaction,
  type VerifiedPaystackTransaction,
  type WalletFundingRecord,
  type WalletState,
} from './walletSecurity';

const PAYSTACK_API_URL = 'https://api.paystack.co';

export class WalletError extends Error {
  status: number;
  code: string;

  constructor(message: string, status = 500, code = 'WALLET_ERROR') {
    super(message);
    this.name = 'WalletError';
    this.status = status;
    this.code = code;
  }
}

type FirebaseUserDetails = {
  uid: string;
  email?: string;
  name?: string;
};

type PaystackResponse = {
  status?: boolean;
  message?: string;
  data?: {
    authorization_url?: string;
    reference?: string;
    id?: number | string;
    status?: string;
    amount?: number | string;
    currency?: string;
    customer?: { email?: string };
  } | null;
};

function requiredEnv(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new WalletError(`${name} is not configured on the server.`, 503, 'WALLET_NOT_CONFIGURED');
  return value;
}

function paystackSecret() {
  const secret = requiredEnv('PAYSTACK_SECRET_KEY');
  const mode = process.env.PAYSTACK_MODE;
  if ((mode === 'test' && !secret.startsWith('sk_test_')) || (mode === 'live' && !secret.startsWith('sk_live_')) || (mode !== 'test' && mode !== 'live')) {
    throw new WalletError('Paystack mode does not match its secret key.', 503, 'PAYSTACK_NOT_READY');
  }
  return secret;
}

function getDatabase() {
  try {
    return getFirebaseAdminDatabase();
  } catch (error) {
    if (error instanceof Error) throw new WalletError(error.message, 503, 'WALLET_DATABASE_NOT_CONFIGURED');
    throw error;
  }
}

function fundingPath(txRef: string) {
  if (!/^[A-Za-z0-9_-]{12,160}$/.test(txRef)) throw new WalletError('Invalid funding reference.', 400, 'INVALID_REFERENCE');
  return `walletFundingTransactions/${txRef}`;
}

function createFundingReference() {
  return `WALLET-${Date.now()}-${randomBytes(10).toString('hex').toUpperCase()}`;
}

function getRecord(value: unknown): WalletFundingRecord | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Partial<WalletFundingRecord>;
  if (typeof record.uid !== 'string' || typeof record.txRef !== 'string' || typeof record.customerEmail !== 'string') return null;
  if (typeof record.amountMinor !== 'number' || record.currency !== 'NGN' || typeof record.status !== 'string') return null;
  return record as WalletFundingRecord;
}

function publicFunding(record: WalletFundingRecord) {
  return {
    txRef: record.txRef,
    amount: record.amountMinor / 100,
    currency: record.currency,
    status: record.status,
    providerTransactionId: record.providerTransactionId || null,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

async function updateFunding(txRef: string, changes: Partial<WalletFundingRecord>) {
  await getDatabase().ref(fundingPath(txRef)).update({ ...changes, updatedAt: Date.now() });
}

async function readFunding(txRef: string) {
  const snapshot = await getDatabase().ref(fundingPath(txRef)).get();
  const record = getRecord(snapshot.val());
  if (!record) throw new WalletError('The wallet funding reference was not found.', 404, 'FUNDING_NOT_FOUND');
  return record;
}

async function paystackRequest<T>(path: string, init: RequestInit): Promise<T> {
  const secretKey = paystackSecret();
  const response = await fetch(`${PAYSTACK_API_URL}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${secretKey}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...(init.headers || {}),
    },
  });
  const payload = await response.json().catch(() => null) as T & { status?: boolean; message?: string } | null;
  if (!response.ok || !payload || payload.status !== true) {
    console.warn('[wallet] Paystack request failed', { path, httpStatus: response.status, providerStatus: payload?.status });
    throw new WalletError('Paystack could not process the wallet funding request.', 502, 'PAYSTACK_REQUEST_FAILED');
  }
  return payload;
}

export async function createWalletFunding(input: { user: FirebaseUserDetails; amount: unknown }) {
  let email: string;
  try {
    email = requireCustomerEmail(input.user.email);
  } catch (error) {
    if (error instanceof Error) throw new WalletError(error.message, 400, 'AUTH_EMAIL_REQUIRED');
    throw error;
  }
  const { amountMinor, amount } = parseAmountToMinor(input.amount);
  const redirectUrl = requiredEnv('PAYSTACK_CALLBACK_URL');
  const txRef = createFundingReference();
  const now = Date.now();
  const record: WalletFundingRecord = {
    uid: input.user.uid,
    txRef,
    amountMinor,
    currency: 'NGN',
    customerEmail: email,
    customerName: input.user.name?.trim() || email.split('@')[0],
    status: 'pending',
    createdAt: now,
    updatedAt: now,
  };

  const database = getDatabase();
  await database.ref(fundingPath(txRef)).set(record);

  try {
    const response = await paystackRequest<PaystackResponse>('/transaction/initialize', {
      method: 'POST',
      body: JSON.stringify({
        reference: txRef,
        amount: String(amountMinor),
        currency: 'NGN',
        email,
        callback_url: redirectUrl,
        metadata: { user_id: input.user.uid },
      }),
    });
    const checkoutUrl = response.data?.authorization_url;
    if (!checkoutUrl || !checkoutUrl.startsWith('https://checkout.paystack.com/') || response.data?.reference !== txRef) {
      throw new WalletError('Paystack did not return a valid checkout URL.', 502, 'CHECKOUT_URL_MISSING');
    }
    await updateFunding(txRef, { status: 'checkout_created', checkoutUrl });
    return { txRef, amount, currency: 'NGN', status: 'checkout_created', checkoutUrl };
  } catch (error) {
    await updateFunding(txRef, { status: 'failed', failureCode: error instanceof WalletError ? error.code : 'CHECKOUT_REQUEST_FAILED' }).catch(() => undefined);
    throw error;
  }
}

async function verifyPaystackFunding(reference: string): Promise<VerifiedPaystackTransaction> {
  try {
    return await verifySharedPaystackTransaction(reference, paystackSecret());
  } catch (error) {
    if (error instanceof Error) {
      throw new WalletError(error.message === 'provider returned an incomplete verification response'
        ? 'Paystack returned an incomplete transaction verification response.'
        : error.message, 502, 'INVALID_PROVIDER_RESPONSE');
    }
    throw error;
  }
}

export async function reconcileWalletFunding(txRef: string, expectedTransactionId?: string) {
  let record = await readFunding(txRef);
  if (record.status === 'successful') return publicFunding(record);
  await updateFunding(txRef, { status: 'processing' });
  record = await readFunding(txRef);
  const transaction = await verifyPaystackFunding(record.txRef);
  if (expectedTransactionId && transaction.id !== expectedTransactionId) throw new WalletError('The Paystack transaction ID does not match the webhook event.', 409, 'TRANSACTION_ID_MISMATCH');

  if (transaction.reference !== record.txRef) throw new WalletError('The provider transaction reference does not match the funding attempt.', 409, 'REFERENCE_MISMATCH');
  if (transaction.currency.toUpperCase() !== 'NGN') throw new WalletError('The provider transaction currency is not NGN.', 409, 'CURRENCY_MISMATCH');

  if (transaction.status !== 'success') {
    await updateFunding(txRef, { status: 'failed', providerTransactionId: transaction.id, failureCode: 'PAYMENT_NOT_SUCCESSFUL' });
    return publicFunding(await readFunding(txRef));
  }

  validateSuccessfulPaystackTransaction(record, transaction);
  const database = getDatabase();
  const walletReference = database.ref(`wallets/${record.uid}`);
  const claim = { txRef: record.txRef, amountMinor: record.amountMinor, providerTransactionId: transaction.id, createdAt: Date.now() };
  const result = await walletReference.transaction((current: WalletState | null) => applyWalletFundingClaim(current, claim).state);
  if (!result.committed) throw new WalletError('The wallet balance update was not committed.', 503, 'WALLET_UPDATE_NOT_COMMITTED');

  await database.ref().update({
    [`walletFundingTransactions/${record.txRef}`]: {
      ...record,
      status: 'successful',
      providerTransactionId: transaction.id,
      creditedAt: Date.now(),
      updatedAt: Date.now(),
    },
    [`walletLedger/${record.uid}/${record.txRef}`]: walletFundingLedgerEntry(record, transaction.id, Date.now()),
  });

  return publicFunding(await readFunding(txRef));
}

export async function getWalletBalance(uid: string) {
  const snapshot = await getDatabase().ref(`wallets/${uid}`).get();
  const value = snapshot.val() as Partial<WalletState> | null;
  const balanceCandidate = value?.balanceMinor;
  const balanceMinor = typeof balanceCandidate === 'number' && Number.isSafeInteger(balanceCandidate) && balanceCandidate >= 0 ? balanceCandidate : 0;
  return { balanceMinor, balance: (balanceMinor / 100).toFixed(2), currency: 'NGN' };
}

export async function getWalletFundingStatus(uid: string, txRef: string) {
  const record = await readFunding(txRef);
  if (record.uid !== uid) throw new WalletError('You are not authorized to view this funding attempt.', 403, 'FUNDING_FORBIDDEN');
  return publicFunding(record);
}

export async function recordPaystackWebhookEvent(eventKey: string, event: { event: string; transactionId: string; txRef: string; status: string }) {
  const reference = getDatabase().ref(`paystackWebhookEvents/${eventKey}`);
  const result = await reference.transaction((current) => current === null ? { ...event, receivedAt: Date.now() } : undefined);
  return result.committed;
}
