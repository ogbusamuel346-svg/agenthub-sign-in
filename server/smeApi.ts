import { randomBytes } from 'node:crypto';
import { isFirebaseAdminConfigured } from './firebaseAdmin';

const DEFAULT_BASE_URL = 'https://connect.topupmate.com/api/';

export class TopupmateApiError extends Error {
  status: number;
  code: string;
  details?: unknown;

  constructor(message: string, status = 502, code = 'TOPUPMATE_API_ERROR', details?: unknown) {
    super(message);
    this.name = 'TopupmateApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

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

export type TopupmateWalletBalance = {
  balance: number;
  currency: 'NGN';
  status: string;
  usdBalance: number | null;
  usdDueBalance: number | null;
};

type JsonRecord = Record<string, unknown>;

function getApiBaseUrl() {
  return (process.env.TOPUPMATE_API_BASE_URL || DEFAULT_BASE_URL).replace(/\/+$/, '');
}

function getApiToken() {
  return process.env.TOPUPMATE_API_TOKEN?.trim();
}

function getRequestTimeoutMs() {
  return Number(process.env.TOPUPMATE_REQUEST_TIMEOUT_MS || 15_000);
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function firstValue(record: JsonRecord, keys: string[]) {
  for (const key of keys) {
    if (record[key] !== undefined && record[key] !== null && record[key] !== '') return record[key];
  }
  return undefined;
}

function asString(value: unknown, fallback = '') {
  return value === undefined || value === null ? fallback : String(value);
}

function asNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value.replace(/[,₦\s]/g, ''));
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function extractArray(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (!isRecord(value)) return [];
  for (const key of ['plans', 'data', 'results', 'items', 'response']) {
    const candidate = value[key];
    if (Array.isArray(candidate)) return candidate;
    if (isRecord(candidate)) {
      const nested = extractArray(candidate);
      if (nested.length > 0) return nested;
    }
  }
  return [];
}

function normalizePlan(value: unknown): TopupmatePlan | null {
  if (!isRecord(value)) return null;
  const id = firstValue(value, ['id', 'planid', 'plan_id', 'planId']);
  if (id === undefined) return null;

  // The live catalogue includes both a human-readable network label and the numeric
  // provider ID required by the purchase endpoint. Always prefer the ID for requests.
  const network = firstValue(value, ['networkid', 'network_id', 'networkId', 'network']);
  const networkLabel = asString(firstValue(value, ['network_name', 'networkName', 'network_label', 'networkLabel', 'network']), network === undefined ? 'Unknown network' : `Network ${network}`);
  const name = asString(firstValue(value, ['plan_name', 'planName', 'name', 'plan', 'description']), `Plan ${id}`);
  const category = asString(firstValue(value, ['type', 'category', 'plantype', 'plan_type', 'planType']), 'Uncategorised');
  const validity = asString(firstValue(value, ['validity', 'validity_period', 'validityPeriod', 'duration', 'day']), 'Not provided');
  const price = asNumber(firstValue(value, ['user_price', 'userPrice', 'price', 'amount']));

  return { id: typeof id === 'number' ? id : String(id), network: typeof network === 'number' ? network : network === undefined ? null : String(network), networkLabel, name, category, validity, price };
}

export function normalizeDataPlans(payload: unknown): TopupmatePlan[] {
  return extractArray(payload).map(normalizePlan).filter((plan): plan is TopupmatePlan => plan !== null);
}

function normalizeNetwork(value: unknown): TopupmateNetwork | null {
  if (!isRecord(value)) return null;
  const id = firstValue(value, ['networkid', 'network_id', 'networkId', 'id']);
  if (id === undefined) return null;
  const status = asString(firstValue(value, ['status', 'state', 'availability']), '');
  return {
    id: typeof id === 'number' ? id : String(id),
    name: asString(firstValue(value, ['network', 'network_name', 'networkName', 'name']), `Network ${id}`),
    status,
    available: !status || /^(on|active|available|enabled|success|successful)$/i.test(status),
  };
}

export function normalizeNetworks(payload: unknown): TopupmateNetwork[] {
  return extractArray(payload).map(normalizeNetwork).filter((network): network is TopupmateNetwork => network !== null);
}

function normalizeExamProduct(value: unknown): TopupmateExamProduct | null {
  if (!isRecord(value)) return null;
  const id = firstValue(value, ['id', 'providerid', 'provider_id', 'providerId', 'planid', 'plan_id']);
  if (id === undefined) return null;

  const status = asString(firstValue(value, ['status', 'state', 'availability']), '');
  const available = typeof value.active === 'boolean'
    ? value.active
    : !status || /^(on|active|available|enabled|success|successful)$/i.test(status);
  return {
    id: typeof id === 'number' ? id : String(id),
    provider: asString(firstValue(value, ['provider', 'provider_name', 'providerName', 'name']), `Provider ${id}`),
    price: asNumber(firstValue(value, ['price', 'amount', 'user_price', 'userPrice'])),
    status,
    available,
  };
}

export function normalizeExamProducts(payload: unknown): TopupmateExamProduct[] {
  return extractArray(payload).map(normalizeExamProduct).filter((product): product is TopupmateExamProduct => product !== null);
}

function normalizeUtilityProvider(value: unknown): TopupmateUtilityProvider | null {
  if (!isRecord(value)) return null;
  const id = firstValue(value, ['id', 'providerid', 'provider_id', 'providerId']);
  if (id === undefined) return null;
  const status = asString(firstValue(value, ['status', 'state', 'availability']), '');
  return {
    id: typeof id === 'number' ? id : String(id),
    name: asString(firstValue(value, ['provider', 'provider_name', 'providerName', 'name', 'network']), `Provider ${id}`),
    status,
    available: !status || /^(on|active|available|enabled|success|successful)$/i.test(status),
  };
}

export function normalizeUtilityProviders(payload: unknown): TopupmateUtilityProvider[] {
  return extractArray(payload).map(normalizeUtilityProvider).filter((provider): provider is TopupmateUtilityProvider => provider !== null);
}

export function normalizeSupplierBalance(payload: unknown): TopupmateWalletBalance {
  if (!isRecord(payload)) {
    throw new TopupmateApiError('TopupMate returned an invalid wallet-balance response.', 502, 'TOPUPMATE_INVALID_RESPONSE');
  }
  const balance = asNumber(payload.balance);
  if (balance === null || balance < 0) {
    throw new TopupmateApiError('TopupMate returned an invalid wallet-balance response.', 502, 'TOPUPMATE_INVALID_RESPONSE');
  }
  return {
    balance,
    currency: 'NGN',
    status: asString(payload.status, 'unknown'),
    usdBalance: asNumber(payload.usdbalance),
    usdDueBalance: asNumber(payload.usdduebalance),
  };
}

export type SupplierTransactionStatus = 'successful' | 'failed' | 'processing' | 'unknown';

export function getSupplierTransactionStatus(payload: unknown): SupplierTransactionStatus {
  const values: string[] = [];
  const visit = (value: unknown, depth: number) => {
    if (depth > 5 || value === null || value === undefined) return;
    if (Array.isArray(value)) {
      value.slice(0, 20).forEach((item) => visit(item, depth + 1));
      return;
    }
    if (!isRecord(value)) return;
    for (const [key, child] of Object.entries(value)) {
      if (/^(status|state|transaction_status|transactionStatus)$/i.test(key) && (typeof child === 'string' || typeof child === 'number')) values.push(String(child));
      if (typeof child === 'object') visit(child, depth + 1);
    }
  };
  visit(payload, 0);
  const status = values.find(Boolean)?.trim().toLowerCase() || '';
  if (/^(fail|failed|failure|error|cancelled|canceled|reversed)$/.test(status)) return 'failed';
  if (/^(success|successful|completed|complete|ok)$/.test(status)) return 'successful';
  if (/^(processing|pending|queued|timeout|timed_out)$/.test(status)) return 'processing';
  return 'unknown';
}

export function extractExamPins(payload: unknown) {
  const pinKeys = /^(pin|pins|pincode|pin_code|pinCode|exam_pin|examPin|serial|serials|serial_number|serialNumber)$/i;
  const pins: string[] = [];
  const add = (value: unknown) => {
    if (typeof value === 'string' || typeof value === 'number') {
      const normalized = String(value).trim();
      if (normalized && !pins.includes(normalized)) pins.push(normalized);
    }
  };
  const visit = (value: unknown, depth: number) => {
    if (depth > 8 || value === null || value === undefined) return;
    if (Array.isArray(value)) {
      value.slice(0, 100).forEach((item) => visit(item, depth + 1));
      return;
    }
    if (!isRecord(value)) return;
    for (const [key, child] of Object.entries(value)) {
      if (pinKeys.test(key)) {
        if (Array.isArray(child)) child.forEach(add);
        else add(child);
      }
      if (typeof child === 'object') visit(child, depth + 1);
    }
  };
  visit(payload, 0);
  return pins;
}

export function createTransactionReference(service: string) {
  const normalized = service.replace(/[^a-z0-9]/gi, '').toUpperCase() || 'SERVICE';
  return `${normalized}-${Date.now()}-${randomBytes(6).toString('hex').toUpperCase()}`;
}

export async function getTopupmateTransaction(reference: string) {
  assertSupplierToken();
  const supplier = await callTopupmateApi(`/transaction/status/?reference=${encodeURIComponent(reference)}`, 'GET');
  const providerStatus = getSupplierTransactionStatus(supplier);
  if (providerStatus === 'unknown') {
    throw new TopupmateApiError('TopupMate returned an unrecognized transaction-status response.', 502, 'TOPUPMATE_INVALID_RESPONSE');
  }
  return { supplier, providerStatus };
}

function joinUrl(path: string) {
  return `${getApiBaseUrl()}/${path.replace(/^\/+/, '')}`;
}

export async function callTopupmateApi(path: string, method: 'GET' | 'POST', body?: unknown) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), getRequestTimeoutMs());
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const apiToken = getApiToken();
  if (apiToken) headers.Authorization = `Token ${apiToken}`;

  try {
    const response = await fetch(joinUrl(path), {
      method,
      headers,
      body: method === 'POST' ? JSON.stringify(body ?? {}) : undefined,
      signal: controller.signal,
    });
    const text = await response.text();
    let payload: unknown = null;
    if (text) {
      try { payload = JSON.parse(text); } catch { payload = text; }
    }
    if (!response.ok) {
      throw new TopupmateApiError(`TopupMate API returned HTTP ${response.status}.`, 502, 'TOPUPMATE_API_UPSTREAM_FAILURE', payload);
    }
    return payload;
  } catch (error) {
    if (error instanceof TopupmateApiError) throw error;
    if (error instanceof Error && error.name === 'AbortError') {
      throw new TopupmateApiError('The TopupMate API request timed out.', 504, 'TOPUPMATE_API_TIMEOUT');
    }
    throw new TopupmateApiError('The TopupMate API could not be reached.', 502, 'TOPUPMATE_API_UNREACHABLE');
  } finally {
    clearTimeout(timeout);
  }
}

export function supplierConfigStatus() {
  return {
    provider: 'topupmate',
    configured: Boolean(getApiToken()),
    baseUrl: getApiBaseUrl(),
    purchaseEnabled: process.env.TOPUPMATE_PURCHASES_ENABLED === 'true',
    customerWalletConfigured: Boolean(process.env.CUSTOMER_WALLET_PROVIDER),
    transactionStoreConfigured: Boolean(process.env.CUSTOMER_TRANSACTION_STORE),
    serverAuthConfigured: isFirebaseAdminConfigured(),
  };
}

export function assertSupplierToken() {
  if (!getApiToken()) throw new TopupmateApiError('TOPUPMATE_API_TOKEN is not configured on the server.', 503, 'TOPUPMATE_API_NOT_CONFIGURED');
}

export function assertPurchaseInfrastructure() {
  const missing: string[] = [];
  if (process.env.TOPUPMATE_PURCHASES_ENABLED !== 'true') missing.push('TOPUPMATE_PURCHASES_ENABLED=true');
  if (!process.env.CUSTOMER_WALLET_PROVIDER) missing.push('CUSTOMER_WALLET_PROVIDER');
  if (!process.env.CUSTOMER_TRANSACTION_STORE) missing.push('CUSTOMER_TRANSACTION_STORE');
  if (!isFirebaseAdminConfigured()) missing.push('server-verified Firebase Admin credentials');
  if (missing.length) {
    throw new TopupmateApiError(`Customer purchase processing is disabled until the wallet, transaction store and server-side authentication are configured: ${missing.join(', ')}.`, 503, 'CUSTOMER_PURCHASES_NOT_CONFIGURED');
  }
}

export function requireJsonObject(value: unknown, message: string) {
  if (!isRecord(value)) throw new TopupmateApiError(message, 400, 'INVALID_REQUEST');
  return value;
}

export function requireString(record: JsonRecord, key: string, message = `${key} is required.`) {
  const value = record[key];
  if (typeof value !== 'string' || !value.trim()) throw new TopupmateApiError(message, 400, 'INVALID_REQUEST');
  return value.trim();
}

export function requirePositiveNumber(record: JsonRecord, key: string) {
  const value = typeof record[key] === 'number' ? record[key] : Number(record[key]);
  if (!Number.isFinite(value) || value <= 0) throw new TopupmateApiError(`${key} must be a positive number.`, 400, 'INVALID_REQUEST');
  return value;
}

export function requirePositiveInteger(record: JsonRecord, key: string) {
  const value = typeof record[key] === 'number' ? record[key] : Number(record[key]);
  if (!Number.isInteger(value) || value <= 0) throw new TopupmateApiError(`${key} must be a positive integer.`, 400, 'INVALID_REQUEST');
  return value;
}

export function normalizePhone(value: string) {
  const phone = value.replace(/[\s-]/g, '');
  if (!/^0\d{10}$/.test(phone)) throw new TopupmateApiError('phone must be an 11-digit Nigerian number starting with 0.', 400, 'INVALID_REQUEST');
  return phone;
}

export function requireDocumentedPurchaseBody(service: string, body: unknown) {
  const input = requireJsonObject(body, 'A JSON request body is required.');
  const ref = typeof input.ref === 'string' && input.ref.trim() ? input.ref.trim() : createTransactionReference(service);
  return { input, ref };
}

