import { randomBytes } from 'node:crypto';
import { getFirebaseAdminDatabase } from './firebaseAdmin';
import { verifyFlutterwaveTransaction as verifySharedFlutterwaveTransaction } from '../shared/flutterwave';
import {
  applyWalletFundingClaim,
  walletFundingLedgerEntry,
  parseAmountToMinor,
  requireCustomerEmail,
  validateSuccessfulFlutterwaveTransaction,
  type VerifiedFlutterwaveTransaction,
  type WalletFundingRecord,
  type WalletState,
} from './walletSecurity';

const FLUTTERWAVE_API_URL = 'https://api.flutterwave.com/v3';

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

type FlutterwaveResponse = {
  status?: string;
  message?: string;
  data?: {
    link?: string;
    id?: number | string;
    tx_ref?: string;
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

async function flutterwaveRequest<T>(path: string, init: RequestInit): Promise<T> {
  const secretKey = requiredEnv('FLW_SECRET_KEY');
  const response = await fetch(`${FLUTTERWAVE_API_URL}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${secretKey}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...(init.headers || {}),
    },
  });
  const payload = await response.json().catch(() => null) as T & { status?: string; message?: string } | null;
  if (!response.ok || !payload || payload.status !== 'success') {
    console.warn('[wallet] Flutterwave request failed', { path, httpStatus: response.status, providerStatus: payload?.status });
    throw new WalletError('Flutterwave could not process the wallet funding request.', 502, 'FLUTTERWAVE_REQUEST_FAILED');
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
  const redirectUrl = requiredEnv('FLW_REDIRECT_URL');
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
    const response = await flutterwaveRequest<FlutterwaveResponse>('/payments', {
      method: 'POST',
      body: JSON.stringify({
        tx_ref: txRef,
        amount,
        currency: 'NGN',
        redirect_url: redirectUrl,
        customer: { email, name: record.customerName },
        customizations: { title: 'SamEduHub Wallet Funding' },
      }),
    });
    const checkoutUrl = response.data?.link;
    if (!checkoutUrl || !checkoutUrl.startsWith('https://')) {
      throw new WalletError('Flutterwave did not return a valid checkout URL.', 502, 'CHECKOUT_URL_MISSING');
    }
    await updateFunding(txRef, { status: 'checkout_created', checkoutUrl });
    return { txRef, amount, currency: 'NGN', status: 'checkout_created', checkoutUrl };
  } catch (error) {
    await updateFunding(txRef, { status: 'failed', failureCode: error instanceof WalletError ? error.code : 'CHECKOUT_REQUEST_FAILED' }).catch(() => undefined);
    throw error;
  }
}

async function verifyFlutterwaveTransaction(transactionId: string): Promise<VerifiedFlutterwaveTransaction> {
  if (!/^\d+$/.test(transactionId)) throw new WalletError('Invalid Flutterwave transaction ID.', 400, 'INVALID_PROVIDER_TRANSACTION_ID');
  try {
    return await verifySharedFlutterwaveTransaction(transactionId, requiredEnv('FLW_SECRET_KEY'));
  } catch (error) {
    if (error instanceof Error) {
      throw new WalletError(error.message === 'provider returned an incomplete verification response'
        ? 'Flutterwave returned an incomplete transaction verification response.'
        : error.message, 502, 'INVALID_PROVIDER_RESPONSE');
    }
    throw error;
  }
}

export async function reconcileWalletFunding(txRef: string, transactionId: string) {
  let record = await readFunding(txRef);
  if (record.status === 'successful') return publicFunding(record);
  await updateFunding(txRef, { status: 'processing' });
  record = await readFunding(txRef);
  const transaction = await verifyFlutterwaveTransaction(transactionId);

  if (transaction.txRef !== record.txRef) throw new WalletError('The provider transaction reference does not match the funding attempt.', 409, 'REFERENCE_MISMATCH');
  if (transaction.currency.toUpperCase() !== 'NGN') throw new WalletError('The provider transaction currency is not NGN.', 409, 'CURRENCY_MISMATCH');

  if (transaction.status !== 'successful') {
    await updateFunding(txRef, { status: 'failed', providerTransactionId: transaction.id, failureCode: 'PAYMENT_NOT_SUCCESSFUL' });
    return publicFunding(await readFunding(txRef));
  }

  validateSuccessfulFlutterwaveTransaction(record, transaction);
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

export async function recordFlutterwaveWebhookEvent(eventKey: string, event: { event: string; transactionId: string; txRef: string; status: string }) {
  const reference = getDatabase().ref(`flutterwaveWebhookEvents/${eventKey}`);
  const result = await reference.transaction((current) => current === null ? { ...event, receivedAt: Date.now() } : undefined);
  return result.committed;
}
