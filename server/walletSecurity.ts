import {
  applyWalletFundingClaim as applySharedWalletFundingClaim,
  isValidFlutterwaveWebhookSignature as isValidSharedFlutterwaveWebhookSignature,
  makeWebhookEventKey,
  walletFundingLedgerEntry,
  validateSuccessfulFlutterwaveTransaction as validateSharedFlutterwaveTransaction,
  type WalletFundingClaim,
  type WalletState,
  type VerifiedFlutterwaveTransaction,
} from '../shared/walletSecurity';

export type WalletFundingStatus = 'pending' | 'checkout_created' | 'processing' | 'successful' | 'failed';

export type WalletFundingRecord = {
  uid: string;
  txRef: string;
  amountMinor: number;
  currency: 'NGN';
  customerEmail: string;
  customerName: string;
  status: WalletFundingStatus;
  createdAt: number;
  updatedAt: number;
  checkoutUrl?: string;
  providerTransactionId?: string;
  failureCode?: string;
};

export type { WalletFundingClaim, WalletState, VerifiedFlutterwaveTransaction } from '../shared/walletSecurity';

export class WalletValidationError extends Error {
  code: string;

  constructor(message: string, code = 'INVALID_WALLET_REQUEST') {
    super(message);
    this.name = 'WalletValidationError';
    this.code = code;
  }
}

export function parseAmountToMinor(value: unknown) {
  const raw = typeof value === 'number' ? String(value) : typeof value === 'string' ? value.trim() : '';
  if (!/^\d+(?:\.\d{1,2})?$/.test(raw)) {
    throw new WalletValidationError('amount must be a positive NGN amount with at most two decimal places.', 'INVALID_AMOUNT');
  }

  const amountMinor = Math.round(Number(raw) * 100);
  if (!Number.isSafeInteger(amountMinor) || amountMinor <= 0) {
    throw new WalletValidationError('amount must be greater than zero.', 'INVALID_AMOUNT');
  }

  return { amountMinor, amount: amountMinor / 100 };
}

export function requireCustomerEmail(value: unknown) {
  if (typeof value !== 'string' || !value.trim() || !value.includes('@')) {
    throw new WalletValidationError('The authenticated Firebase account must have an email address.', 'AUTH_EMAIL_REQUIRED');
  }
  return value.trim().toLowerCase();
}

export function isValidFlutterwaveWebhookSignature(signature: string | undefined, secretHash: string | undefined) {
  return isValidSharedFlutterwaveWebhookSignature(signature, secretHash);
}

export function validateSuccessfulFlutterwaveTransaction(record: WalletFundingRecord, transaction: VerifiedFlutterwaveTransaction) {
  try {
    validateSharedFlutterwaveTransaction(record, transaction);
  } catch (error) {
    if (error instanceof Error && 'code' in error && typeof error.code === 'string') {
      throw new WalletValidationError(error.message, error.code);
    }
    throw error;
  }
}

export function applyWalletFundingClaim(current: WalletState | null, claim: WalletFundingClaim) {
  return applySharedWalletFundingClaim(current, claim);
}

export { makeWebhookEventKey, walletFundingLedgerEntry };
