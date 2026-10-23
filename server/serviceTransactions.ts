import { Buffer } from 'node:buffer';
import { randomUUID } from 'node:crypto';
import { getFirebaseAdminDatabase } from './firebaseAdmin';

export type ExamTransactionStatus = 'processing' | 'pending' | 'successful' | 'failed';

export type ExamTransactionRecord = {
  uid: string;
  reference: string;
  service: 'exam-pin';
  providerId: string;
  providerName: string;
  quantity: number;
  unitPriceMinor: number;
  totalAmountMinor: number;
  currency: 'NGN';
  status: ExamTransactionStatus;
  providerStatus?: string;
  pins?: string[];
  failureCode?: string;
  createdAt: number;
  updatedAt: number;
  debitedAt?: number;
  refundedAt?: number;
};

type WalletDebit = {
  reference: string;
  amountMinor: number;
  createdAt: number;
};

type WalletRefund = WalletDebit;

type WalletRecord = {
  balanceMinor?: unknown;
  serviceDebits?: Record<string, WalletDebit>;
  serviceRefunds?: Record<string, WalletRefund>;
  updatedAt?: unknown;
  [key: string]: unknown;
};

export class ServiceTransactionError extends Error {
  status: number;
  code: string;

  constructor(message: string, status = 500, code = 'SERVICE_TRANSACTION_ERROR') {
    super(message);
    this.name = 'ServiceTransactionError';
    this.status = status;
    this.code = code;
  }
}

function getDatabase() {
  try {
    return getFirebaseAdminDatabase();
  } catch (error) {
    if (error instanceof Error) throw new ServiceTransactionError(error.message, 503, 'TRANSACTION_STORE_NOT_CONFIGURED');
    throw error;
  }
}

function databaseKey(value: string) {
  return Buffer.from(value, 'utf8').toString('base64url');
}

function transactionPath(uid: string, reference: string) {
  return `serviceTransactions/${databaseKey(uid)}/${databaseKey(reference)}`;
}

function asWalletRecord(value: unknown): WalletRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { balanceMinor: 0, serviceDebits: {}, serviceRefunds: {} };
  const record = value as WalletRecord;
  return {
    ...record,
    balanceMinor: Number.isSafeInteger(record.balanceMinor) && Number(record.balanceMinor) >= 0 ? Number(record.balanceMinor) : 0,
    serviceDebits: record.serviceDebits && typeof record.serviceDebits === 'object' ? record.serviceDebits : {},
    serviceRefunds: record.serviceRefunds && typeof record.serviceRefunds === 'object' ? record.serviceRefunds : {},
  };
}

function publicRecord(record: ExamTransactionRecord) {
  return {
    reference: record.reference,
    service: record.service,
    product: { id: record.providerId, provider: record.providerName },
    providerId: record.providerId,
    providerName: record.providerName,
    quantity: record.quantity,
    unitPrice: record.unitPriceMinor / 100,
    totalAmount: record.totalAmountMinor / 100,
    currency: record.currency,
    status: record.status,
    providerStatus: record.providerStatus || null,
    pins: record.pins || [],
    failureCode: record.failureCode || null,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    debitedAt: record.debitedAt || null,
    refundedAt: record.refundedAt || null,
  };
}

function readRecord(value: unknown): ExamTransactionRecord | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Partial<ExamTransactionRecord>;
  if (
    record.service !== 'exam-pin' ||
    typeof record.uid !== 'string' ||
    typeof record.reference !== 'string' ||
    typeof record.providerId !== 'string' ||
    typeof record.providerName !== 'string' ||
    !Number.isInteger(record.quantity) ||
    !Number.isSafeInteger(record.unitPriceMinor) ||
    !Number.isSafeInteger(record.totalAmountMinor) ||
    record.currency !== 'NGN' ||
    !['processing', 'pending', 'successful', 'failed'].includes(String(record.status)) ||
    !Number.isFinite(record.createdAt) ||
    !Number.isFinite(record.updatedAt)
  ) return null;
  return record as ExamTransactionRecord;
}

// TopupMate history and status/refund helpers.

// Claim the reference transactionally before debit so concurrent copies cannot
// both submit supplier requests. Purchase activation is separately disabled.
export async function beginExamTransaction(input: {
  uid: string; reference: string; providerId: string | number; providerName: string;
  quantity: number; unitPriceMinor: number;
}) {
  const total = input.quantity * input.unitPriceMinor;
  if (!Number.isInteger(input.quantity) || input.quantity < 1 || !Number.isSafeInteger(input.unitPriceMinor) || input.unitPriceMinor <= 0 || !Number.isSafeInteger(total)) {
    throw new ServiceTransactionError('Invalid exam order.', 400, 'INVALID_REQUEST');
  }
  const now = Date.now();
  const claimToken = randomUUID();
  const record: ExamTransactionRecord = {
    uid: input.uid, reference: input.reference, service: 'exam-pin', providerId: String(input.providerId),
    providerName: input.providerName, quantity: input.quantity, unitPriceMinor: input.unitPriceMinor,
    totalAmountMinor: total, currency: 'NGN', status: 'processing', createdAt: now, updatedAt: now,
  };
  const database = getDatabase();
  const recordReference = database.ref(transactionPath(input.uid, input.reference));
  const claim = await recordReference.transaction(current => current || { ...record, claimToken }, undefined, false);
  const saved = readRecord(claim.snapshot.val());
  if (!claim.committed || !saved) throw new ServiceTransactionError('The order could not be saved.', 503, 'TRANSACTION_RECORD_FAILED');
  if (saved.providerId !== record.providerId || saved.quantity !== record.quantity || saved.unitPriceMinor !== record.unitPriceMinor) {
    throw new ServiceTransactionError('This reference belongs to a different order.', 409, 'REFERENCE_CONFLICT');
  }
  if (claim.snapshot.child('claimToken').val() !== claimToken) return { created: false, record: saved };
  const walletReference = database.ref(`wallets/${input.uid}`);
  const debitKey = databaseKey(input.reference);
  const debit = await walletReference.transaction(current => {
    const wallet = asWalletRecord(current);
    if (wallet.serviceDebits?.[debitKey] || Number(wallet.balanceMinor) < total) return wallet;
    return { ...wallet, balanceMinor: Number(wallet.balanceMinor) - total,
      serviceDebits: { ...wallet.serviceDebits, [debitKey]: { reference: record.reference, amountMinor: total, createdAt: now } }, updatedAt: now };
  }, undefined, false);
  if (!debit.committed || debit.snapshot.child(`serviceDebits/${debitKey}/amountMinor`).val() !== total) {
    await recordReference.update({ status: 'failed', failureCode: 'INSUFFICIENT_WALLET_BALANCE', updatedAt: Date.now() });
    throw new ServiceTransactionError('Your wallet balance is insufficient for this exam-pin purchase.', 402, 'INSUFFICIENT_WALLET_BALANCE');
  }
  const updated = { debitedAt: Date.now(), updatedAt: Date.now() };
  await recordReference.update(updated);
  return { created: true, record: { ...record, ...updated } };
}

export async function updateExamTransaction(uid: string, reference: string, changes: Partial<ExamTransactionRecord>) {
  const recordReference = getDatabase().ref(transactionPath(uid, reference));
  const current = readRecord((await recordReference.get()).val());
  if (!current || current.uid !== uid) throw new ServiceTransactionError('The exam-pin transaction record could not be found.', 404, 'TRANSACTION_NOT_FOUND');
  const updated = { ...changes, updatedAt: Date.now() };
  await recordReference.update(updated);
  return publicRecord({ ...current, ...updated } as ExamTransactionRecord);
}

export async function getExamTransaction(uid: string, reference: string) {
  const record = readRecord((await getDatabase().ref(transactionPath(uid, reference)).get()).val());
  return record && record.uid === uid ? publicRecord(record) : null;
}

export async function refundExamTransaction(uid: string, reference: string, failureCode: string) {
  const database = getDatabase();
  const recordReference = database.ref(transactionPath(uid, reference));
  const record = readRecord((await recordReference.get()).val());
  if (!record || record.uid !== uid) throw new ServiceTransactionError('The exam-pin transaction record could not be found.', 404, 'TRANSACTION_NOT_FOUND');
  if (record.status === 'successful') throw new ServiceTransactionError('A successful order cannot be refunded by a status refresh.', 409, 'TRANSACTION_FINAL');
  if (record.status === 'failed' && record.refundedAt) return publicRecord(record);

  const walletReference = database.ref(`wallets/${uid}`);
  const debitKey = databaseKey(reference);
  const refundKey = debitKey;
  const now = Date.now();
  await walletReference.transaction((current: unknown) => {
    const wallet = asWalletRecord(current);
    const debits = wallet.serviceDebits || {};
    const refunds = wallet.serviceRefunds || {};
    if (!debits[debitKey] || refunds[refundKey]) return wallet;
    return {
      ...wallet,
      balanceMinor: Number(wallet.balanceMinor) + record.totalAmountMinor,
      serviceRefunds: { ...refunds, [refundKey]: { reference, amountMinor: record.totalAmountMinor, createdAt: now } },
      updatedAt: now,
    };
  });

  const updated = { status: 'failed' as const, failureCode, refundedAt: now, updatedAt: now };
  await recordReference.update(updated);
  return publicRecord({ ...record, ...updated });
}

export async function listExamTransactions(uid: string) {
  const snapshot = await getDatabase().ref(`serviceTransactions/${databaseKey(uid)}`).get();
  const value = snapshot.val();
  if (!value || typeof value !== 'object') return [];
  return Object.values(value)
    .map(readRecord)
    .filter((record): record is ExamTransactionRecord => Boolean(record && record.uid === uid))
    .sort((left, right) => right.createdAt - left.createdAt)
    .slice(0, 50)
    .map(publicRecord);
}
