import { apiRequest } from './apiClient';

export type WalletBalance = { balanceMinor: number; balance: string; currency: string };
export type WalletFunding = { txRef: string; amount: number; currency: string; status: string; checkoutUrl?: string; providerTransactionId?: string | null; createdAt: number; updatedAt: number };
export type DedicatedVirtualAccount = {
  status: 'assigned' | 'pending' | 'creating' | 'failed' | 'not_created';
  account: {
    accountNumber: string;
    accountName: string | null;
    bankName: string | null;
    currency: string;
  } | null;
  message?: string;
};

async function walletRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const apiRoot = import.meta.env.VITE_CLOUDFLARE_API === 'true' ? '/api/cloudflare/wallet' : '/api/wallet';
  return apiRequest<T>(`${apiRoot}${path}`, init, {
    authenticated: true,
    errorMessage: 'The wallet request could not be completed.',
  });
}

export function getWalletBalance() {
  return walletRequest<WalletBalance>('');
}

export function createWalletFunding(amount: string) {
  return walletRequest<WalletFunding>('/funding', { method: 'POST', body: JSON.stringify({ amount }) });
}

export function getWalletFundingStatus(txRef: string) {
  return walletRequest<WalletFunding>(`/funding/${encodeURIComponent(txRef)}`);
}

export function getDedicatedVirtualAccount() {
  return apiRequest<DedicatedVirtualAccount>('/api/cloudflare/paystack/virtual-account', undefined, {
    authenticated: true,
    errorMessage: 'Your dedicated account could not be loaded right now.',
  });
}

export function createDedicatedVirtualAccount(phone: string) {
  return apiRequest<DedicatedVirtualAccount>('/api/cloudflare/paystack/virtual-account', {
    method: 'POST',
    body: JSON.stringify({ phone }),
  }, {
    authenticated: true,
    errorMessage: 'Paystack could not create your dedicated account.',
  });
}
