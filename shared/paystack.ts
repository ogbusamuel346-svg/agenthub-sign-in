import type { VerifiedPaystackTransaction } from './walletSecurity';

const PAYSTACK_API_URL = 'https://api.paystack.co';

type PaystackVerifyResponse = {
  status?: boolean;
  data?: {
    id?: number | string;
    reference?: string;
    status?: string;
    amount?: number | string;
    currency?: string;
    customer?: { email?: string };
  } | null;
};

export async function verifyPaystackTransaction(reference: string, secretKey: string): Promise<VerifiedPaystackTransaction> {
  if (!/^[A-Za-z0-9_.=-]{12,160}$/.test(reference)) throw new Error('invalid provider transaction reference');
  const response = await fetch(`${PAYSTACK_API_URL}/transaction/verify/${encodeURIComponent(reference)}`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${secretKey}`, Accept: 'application/json' },
  });
  const payload = await response.json().catch(() => null) as PaystackVerifyResponse | null;
  if (!response.ok || payload?.status !== true || !payload.data) throw new Error('provider verification failed');

  const data = payload.data;
  if (data.id === undefined || typeof data.reference !== 'string' || typeof data.status !== 'string' || data.amount === undefined || typeof data.currency !== 'string') {
    throw new Error('provider returned an incomplete verification response');
  }
  const amountMinor = Number(data.amount);
  if (!/^\d+$/.test(String(data.id)) || !Number.isSafeInteger(amountMinor) || amountMinor < 0) throw new Error('provider returned an invalid transaction');
  return {
    id: String(data.id),
    reference: data.reference,
    status: data.status,
    amountMinor,
    currency: data.currency,
    customerEmail: data.customer?.email,
  };
}
