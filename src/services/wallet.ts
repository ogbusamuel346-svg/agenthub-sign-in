import { apiRequest } from './apiClient';

export type WalletBalance = { balanceMinor: number; balance: string; currency: string };
export type WalletFunding = { txRef: string; amount: number; currency: string; status: string; checkoutUrl?: string; providerTransactionId?: string | null; createdAt: number; updatedAt: number };

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
