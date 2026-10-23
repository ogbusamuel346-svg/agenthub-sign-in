import type { VerifiedFlutterwaveTransaction } from './walletSecurity';

const FLUTTERWAVE_API_URL = 'https://api.flutterwave.com/v3';

type FlutterwaveVerifyResponse = {
  status?: string;
  data?: {
    id?: number | string;
    tx_ref?: string;
    status?: string;
    amount?: number | string;
    currency?: string;
    customer?: { email?: string };
  } | null;
};

export async function verifyFlutterwaveTransaction(transactionId: string, secretKey: string): Promise<VerifiedFlutterwaveTransaction> {
  if (!/^\d+$/.test(transactionId)) throw new Error('invalid provider transaction ID');
  const response = await fetch(`${FLUTTERWAVE_API_URL}/transactions/${encodeURIComponent(transactionId)}/verify`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${secretKey}`,
      Accept: 'application/json',
    },
  });
  const payload = await response.json().catch(() => null) as FlutterwaveVerifyResponse | null;
  if (!response.ok || payload?.status !== 'success' || !payload.data) {
    throw new Error('provider verification failed');
  }

  const data = payload.data;
  if (
    data.id === undefined ||
    typeof data.tx_ref !== 'string' ||
    typeof data.status !== 'string' ||
    data.amount === undefined ||
    typeof data.currency !== 'string'
  ) throw new Error('provider returned an incomplete verification response');

  const amount = Number(data.amount);
  if (!Number.isFinite(amount)) throw new Error('provider returned an invalid amount');
  return {
    id: String(data.id),
    txRef: data.tx_ref,
    status: data.status,
    amount,
    currency: data.currency,
    customerEmail: data.customer?.email,
  };
}
