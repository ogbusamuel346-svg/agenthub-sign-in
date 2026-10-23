import { createHmac, timingSafeEqual } from 'node:crypto';

export type WalletFundingClaim = {
  txRef: string;
  amountMinor: number;
  providerTransactionId: string;
  createdAt: number;
};

export type WalletState = {
  balanceMinor: number;
  fundingClaims: Record<string, WalletFundingClaim>;
  updatedAt: number;
  [key: string]: unknown;
};

export type VerifiedPaystackTransaction = {
  id: string;
  reference: string;
  status: string;
  amountMinor: number;
  currency: string;
  customerEmail?: string;
};

type FundingRecordLike = {
  txRef: string;
  amountMinor: number;
  customerEmail: string;
};

export function walletFundingLedgerEntry(record: { txRef: string; amountMinor: number; currency: 'NGN' }, providerTransactionId: string, createdAt: number) {
  return {
    type: 'wallet_funding',
    source: 'paystack',
    txRef: record.txRef,
    providerTransactionId,
    amountMinor: record.amountMinor,
    currency: record.currency,
    createdAt,
  };
}

export class WalletTransactionValidationError extends Error {
  code: string;

  constructor(message: string, code: string) {
    super(message);
    this.name = 'WalletTransactionValidationError';
    this.code = code;
  }
}

// Paystack signs the exact webhook request bytes with HMAC-SHA512 and the secret key.
export function isValidPaystackWebhookSignature(signature: string | undefined, secretKey: string | undefined, rawBody: Uint8Array | undefined) {
  if (!signature || !secretKey || !rawBody) return false;
  const expected = createHmac('sha512', secretKey).update(rawBody).digest();
  const actual = Buffer.from(signature, 'hex');
  if (actual.length !== expected.length) return false;
  return timingSafeEqual(actual, expected);
}

export function validateSuccessfulPaystackTransaction(record: FundingRecordLike, transaction: VerifiedPaystackTransaction) {
  if (transaction.status !== 'success') {
    throw new WalletTransactionValidationError('Paystack did not report a successful payment.', 'PAYMENT_NOT_SUCCESSFUL');
  }
  if (transaction.reference !== record.txRef) {
    throw new WalletTransactionValidationError('The Paystack transaction reference does not match the pending funding attempt.', 'REFERENCE_MISMATCH');
  }
  if (transaction.currency.toUpperCase() !== 'NGN') {
    throw new WalletTransactionValidationError('The Paystack transaction currency is not NGN.', 'CURRENCY_MISMATCH');
  }
  if (transaction.amountMinor !== record.amountMinor) {
    throw new WalletTransactionValidationError('The Paystack transaction amount does not match the pending funding attempt.', 'AMOUNT_MISMATCH');
  }
}

export function applyWalletFundingClaim(current: unknown, claim: WalletFundingClaim) {
  const candidate = current && typeof current === 'object' && !Array.isArray(current) ? current as Partial<WalletState> : {};
  if (!Number.isSafeInteger(claim.amountMinor) || claim.amountMinor <= 0) {
    throw new WalletTransactionValidationError('Invalid wallet funding amount.', 'INVALID_AMOUNT');
  }
  if (candidate.balanceMinor !== undefined && (!Number.isSafeInteger(candidate.balanceMinor) || Number(candidate.balanceMinor) < 0)) {
    throw new WalletTransactionValidationError('Wallet balance requires review.', 'INVALID_WALLET_STATE');
  }
  const state: WalletState = {
    ...candidate,
    balanceMinor: Number.isSafeInteger(candidate.balanceMinor) && (candidate.balanceMinor as number) >= 0
      ? candidate.balanceMinor as number
      : 0,
    fundingClaims: candidate.fundingClaims && typeof candidate.fundingClaims === 'object' && !Array.isArray(candidate.fundingClaims)
      ? candidate.fundingClaims as Record<string, WalletFundingClaim>
      : {},
    updatedAt: typeof candidate.updatedAt === 'number' ? candidate.updatedAt : 0,
  };

  if (state.fundingClaims[claim.txRef]) {
    const existing = state.fundingClaims[claim.txRef];
    if (existing.amountMinor !== claim.amountMinor || existing.providerTransactionId !== claim.providerTransactionId) {
      throw new WalletTransactionValidationError('Funding reference conflicts with its recorded claim.', 'FUNDING_CLAIM_CONFLICT');
    }
    return { state, applied: false };
  }
  if (!Number.isSafeInteger(state.balanceMinor + claim.amountMinor)) {
    throw new WalletTransactionValidationError('Wallet balance exceeds the supported limit.', 'INVALID_WALLET_STATE');
  }

  return {
    state: {
      ...state,
      balanceMinor: state.balanceMinor + claim.amountMinor,
      fundingClaims: { ...state.fundingClaims, [claim.txRef]: claim },
      updatedAt: claim.createdAt,
    },
    applied: true,
  };
}

export function makeWebhookEventKey(event: string, transactionId: string, status: string) {
  return `${event}:${transactionId}:${status}`.replace(/[^a-zA-Z0-9:_-]/g, '_');
}
