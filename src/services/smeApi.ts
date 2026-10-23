import { apiRequest, ApiClientError } from './apiClient';

export type TopupmatePlan = {
  id: string | number;
  network: string | number | null;
  networkLabel: string;
  name: string;
  category: string;
  validity: string;
  price: number | null;
};

export type TopupmateNetwork = {
  id: string | number;
  name: string;
  status: string;
  available: boolean;
};

export type TopupmateExamProduct = {
  id: string | number;
  provider: string;
  price: number | null;
  status: string;
  available: boolean;
};

export type TopupmateUtilityProvider = {
  id: string | number;
  name: string;
  status: string;
  available: boolean;
};

export type ExamPurchase = {
  reference: string;
  status: string;
  product: { id: string | number; provider: string };
  quantity: number;
  unitPrice: number;
  totalAmount: number;
  pins: string[];
  message: string;
};

export type ExamPurchaseHistoryItem = ExamPurchase & {
  service?: string;
  product?: { id: string | number; provider: string };
  providerId?: string;
  providerName?: string;
  providerStatus: string | null;
  currency: string;
  failureCode: string | null;
  createdAt: number;
  updatedAt: number;
  debitedAt: number | null;
  refundedAt: number | null;
};

export type TransactionStatusResponse = {
  reference: string;
  status: string;
  providerStatus: string;
  transaction: ExamPurchaseHistoryItem;
  checkedAt: string;
};

export class TopupmateClientError extends ApiClientError {
  constructor(message: string, status = 500, code = 'API_ERROR') {
    super(message, status, code);
    this.name = 'TopupmateClientError';
  }
}

export type IntegrationHealth = {
  ok: boolean;
  service?: string;
  supplier: {
    provider?: string;
    paymentProvider?: 'paystack';
    configured: boolean;
    purchaseEnabled: boolean;
    paymentMode?: 'test' | 'live' | 'unconfigured';
    supplierMode?: 'sandbox' | 'live' | 'unconfigured';
    customerWalletConfigured: boolean;
    transactionStoreConfigured: boolean;
    serverAuthConfigured: boolean;
    fundingEnabled?: boolean;
  };
};

async function request<T>(path: string, init?: RequestInit, authenticated = false): Promise<T> {
  return apiRequest<T>(`/api/sme/${path.replace(/^\/+/, '')}`, init, {
    authenticated,
    createError: (message, status, code) => new TopupmateClientError(message, status, code),
  });
}

export async function getIntegrationHealth() {
  return apiRequest<IntegrationHealth>('/api/cloudflare/health', undefined, {
    errorMessage: 'The server readiness check could not be completed.',
    errorCode: 'HEALTH_CHECK_FAILED',
    createError: (message, status, code) => new TopupmateClientError(message, status || 503, code),
  });
}

export function getLiveDataPlans() {
  return apiRequest<{ plans: TopupmatePlan[]; fetchedAt: string }>('/api/cloudflare/sme/dataplans');
}

export function getLiveNetworks() {
  return apiRequest<{ networks: TopupmateNetwork[]; fetchedAt: string }>('/api/cloudflare/sme/networks');
}

export function purchaseData(input: { network: string | number; data_plan: string | number; phone: string }) {
  return request<{ reference: string; status: string }>('data', { method: 'POST', body: JSON.stringify(input) }, true);
}

export function purchaseAirtime(input: { network: string | number; amount: number; phone: string }) {
  const ref = getAirtimePurchaseReference(input);
  const result = import.meta.env.VITE_CLOUDFLARE_API === 'true'
    ? apiRequest<{ reference: string; status: string; message: string }>('/api/cloudflare/services/airtime/purchase', { method: 'POST', body: JSON.stringify({ ...input, ref }) }, { authenticated: true })
    : request<{ reference: string; status: string; message: string }>('airtime', { method: 'POST', body: JSON.stringify({ ...input, ref }) }, true);
  return result.then((purchase) => {
    if (purchase.status === 'successful' || purchase.status === 'failed') {
      try { sessionStorage.removeItem(airtimePurchaseAttemptKey); } catch { /* session storage may be unavailable */ }
    }
    return purchase;
  });
}

const airtimePurchaseAttemptKey = 'sameduhub:airtime-purchase-attempt';

function getAirtimePurchaseReference(input: { network: string | number; amount: number; phone: string }) {
  const fingerprint = `${input.network}:${input.amount}:${input.phone}`;
  try {
    const saved = sessionStorage.getItem(airtimePurchaseAttemptKey);
    if (saved) {
      const attempt = JSON.parse(saved) as { fingerprint?: unknown; reference?: unknown };
      if (attempt.fingerprint === fingerprint && typeof attempt.reference === 'string') return attempt.reference;
    }
    const reference = `airtime-${crypto.randomUUID()}`;
    sessionStorage.setItem(airtimePurchaseAttemptKey, JSON.stringify({ fingerprint, reference }));
    return reference;
  } catch {
    return `airtime-${crypto.randomUUID()}`;
  }
}

export function getLiveExamProducts() {
  return apiRequest<{ products: TopupmateExamProduct[]; fetchedAt: string }>('/api/cloudflare/sme/exampins');
}

export function getLiveElectricityProviders() {
  return apiRequest<{ providers: TopupmateUtilityProvider[]; fetchedAt: string }>('/api/cloudflare/sme/electricity/providers');
}

export function verifyElectricityCustomer(input: { provider: string | number; meternumber: string; metertype: 'prepaid' | 'postpaid' }) {
  return apiRequest<{ supplier: unknown; status: string }>('/api/cloudflare/sme/electricity/verify', { method: 'POST', body: JSON.stringify({ payload: input }) }, {
    authenticated: true,
    errorMessage: 'TopupMate could not verify the electricity meter.',
    createError: (message, status, code) => new TopupmateClientError(message, status, code),
  });
}

export function purchaseElectricity(input: { provider: string | number; metertype: 'prepaid' | 'postpaid'; meternumber: string; amount: number; phone: string }) {
  return request<{ reference: string; status: string }>('electricity', { method: 'POST', body: JSON.stringify(input) }, true);
}

const examPurchaseAttemptKey = 'sameduhub:exam-purchase-attempt';

function getExamPurchaseReference(input: { provider: string | number; quantity: number }) {
  const fingerprint = `${input.provider}:${input.quantity}`;
  try {
    const saved = sessionStorage.getItem(examPurchaseAttemptKey);
    if (saved) {
      const attempt = JSON.parse(saved) as { fingerprint?: unknown; reference?: unknown };
      if (attempt.fingerprint === fingerprint && typeof attempt.reference === 'string') return attempt.reference;
    }
    const reference = `exam-${crypto.randomUUID()}`;
    sessionStorage.setItem(examPurchaseAttemptKey, JSON.stringify({ fingerprint, reference }));
    return reference;
  } catch {
    return `exam-${crypto.randomUUID()}`;
  }
}

export async function purchaseExamPin(input: { provider: string | number; quantity: number }) {
  const ref = getExamPurchaseReference(input);
  const result = import.meta.env.VITE_CLOUDFLARE_API === 'true'
    ? await apiRequest<ExamPurchase>('/api/cloudflare/services/exam/purchase', { method: 'POST', body: JSON.stringify({ ...input, ref }) }, { authenticated: true })
    : await request<ExamPurchase>('exam', { method: 'POST', body: JSON.stringify({ ...input, ref }) }, true);
  if (result.status === 'successful' || result.status === 'failed') {
    try { sessionStorage.removeItem(examPurchaseAttemptKey); } catch { /* session storage may be unavailable */ }
  }
  return result;
}

export function getExamPurchaseHistory() {
  if (import.meta.env.VITE_CLOUDFLARE_API === 'true') {
    return apiRequest<{ transactions: ExamPurchaseHistoryItem[] }>('/api/cloudflare/transactions', undefined, { authenticated: true });
  }
  return request<{ transactions: ExamPurchaseHistoryItem[] }>('exam/history', undefined, true);
}

export function getTransactions() {
  if (import.meta.env.VITE_CLOUDFLARE_API === 'true') {
    return apiRequest<{ transactions: ExamPurchaseHistoryItem[] }>('/api/cloudflare/transactions', undefined, { authenticated: true });
  }
  return request<{ transactions: ExamPurchaseHistoryItem[] }>('transactions', undefined, true);
}

export function getTransactionStatus(reference: string) {
  const query = new URLSearchParams({ reference });
  if (import.meta.env.VITE_CLOUDFLARE_API === 'true') {
    return apiRequest<TransactionStatusResponse>(`/api/cloudflare/sme/transaction-status?${query.toString()}`, undefined, { authenticated: true });
  }
  return request<TransactionStatusResponse>(`transaction-status?${query.toString()}`, undefined, true);
}

export function describeApiError(error: unknown) {
  if (error instanceof TopupmateClientError) return error.message;
  return error instanceof Error ? error.message : 'The service request could not be completed.';
}
