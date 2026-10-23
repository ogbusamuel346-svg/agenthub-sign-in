import { timingSafeEqual } from 'node:crypto';

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

export type VerifiedFlutterwaveTransaction = {
  id: string;
  txRef: string;
  status: string;
  amount: number;
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
    source: 'flutterwave',
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

// Flutterwave v3 Standard sends the configured secret in verif-hash.
// Authenticate the notification, then independently verify the payment via API.
export function isValidFlutterwaveWebhookSignature(signature: string | undefined, secretHash: string | undefined) {
  if (!signature || !secretHash) return false;
  const expected = Buffer.from(secretHash, 'utf8');
  const actual = Buffer.from(signature, 'utf8');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
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

export function validateSuccessfulFlutterwaveTransaction(record: FundingRecordLike, transaction: VerifiedFlutterwaveTransaction) {
  if (transaction.status !== 'successful') {
    throw new WalletTransactionValidationError('Flutterwave did not report a successful payment.', 'PAYMENT_NOT_SUCCESSFUL');
  }
  if (transaction.txRef !== record.txRef) {
    throw new WalletTransactionValidationError('The Flutterwave transaction reference does not match the pending funding attempt.', 'REFERENCE_MISMATCH');
  }
  if (transaction.currency.toUpperCase() !== 'NGN') {
    throw new WalletTransactionValidationError('The Flutterwave transaction currency is not NGN.', 'CURRENCY_MISMATCH');
  }
  if (Math.round(transaction.amount * 100) !== record.amountMinor) {
    throw new WalletTransactionValidationError('The Flutterwave transaction amount does not match the pending funding attempt.', 'AMOUNT_MISMATCH');
  }
  // Do not require the payer's Flutterwave email to match the signed-in
  // account. Hosted checkout may omit or allow a different payer email. The
  // verified, server-generated tx_ref binds this payment to the wallet record;
  // status, amount, and currency are still checked above.
}

export function makeWebhookEventKey(event: string, transactionId: string, status: string) {
  return `${event}:${transactionId}:${status}`.replace(/[^a-zA-Z0-9:_-]/g, '_');
}
