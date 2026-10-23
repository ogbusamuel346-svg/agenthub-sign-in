type RecordValue = Record<string, unknown>;

const isRecord = (value: unknown): value is RecordValue => typeof value === 'object' && value !== null && !Array.isArray(value);

function firstValue(record: RecordValue, keys: string[]) {
  for (const key of keys) {
    if (record[key] !== undefined && record[key] !== null && record[key] !== '') return record[key];
  }
  return undefined;
}

const asString = (value: unknown, fallback = '') => value === undefined || value === null ? fallback : String(value);

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
      if (nested.length) return nested;
    }
  }
  return [];
}

function normalizePlan(value: unknown) {
  if (!isRecord(value)) return null;
  const id = firstValue(value, ['id', 'planid', 'plan_id', 'planId']);
  if (id === undefined) return null;
  const network = firstValue(value, ['networkid', 'network_id', 'networkId', 'network']);
  return {
    id: typeof id === 'number' ? id : String(id),
    network: typeof network === 'number' ? network : network === undefined ? null : String(network),
    networkLabel: asString(firstValue(value, ['network_name', 'networkName', 'network_label', 'networkLabel', 'network']), network === undefined ? 'Unknown network' : `Network ${network}`),
    name: asString(firstValue(value, ['plan_name', 'planName', 'name', 'plan', 'description']), `Plan ${id}`),
    category: asString(firstValue(value, ['type', 'category', 'plantype', 'plan_type', 'planType']), 'Uncategorised'),
    validity: asString(firstValue(value, ['validity', 'validity_period', 'validityPeriod', 'duration', 'day']), 'Not provided'),
    price: asNumber(firstValue(value, ['user_price', 'userPrice', 'price', 'amount'])),
  };
}

export function normalizeDataPlans(payload: unknown) {
  return extractArray(payload).map(normalizePlan).filter((plan): plan is NonNullable<typeof plan> => plan !== null);
}

function normalizeNetwork(value: unknown) {
  if (!isRecord(value)) return null;
  const id = firstValue(value, ['networkid', 'network_id', 'networkId', 'id']);
  if (id === undefined) return null;
  const status = asString(firstValue(value, ['status', 'state', 'availability']), '');
  return { id: typeof id === 'number' ? id : String(id), name: asString(firstValue(value, ['network', 'network_name', 'networkName', 'name']), `Network ${id}`), status, available: !status || /^(on|active|available|enabled|success|successful)$/i.test(status) };
}

export function normalizeNetworks(payload: unknown) {
  return extractArray(payload).map(normalizeNetwork).filter((item): item is NonNullable<typeof item> => item !== null);
}

function normalizeExamProduct(value: unknown) {
  if (!isRecord(value)) return null;
  const id = firstValue(value, ['id', 'providerid', 'provider_id', 'providerId', 'planid', 'plan_id']);
  if (id === undefined) return null;
  const status = asString(firstValue(value, ['status', 'state', 'availability']), '');
  const available = typeof value.active === 'boolean' ? value.active : !status || /^(on|active|available|enabled|success|successful)$/i.test(status);
  return { id: typeof id === 'number' ? id : String(id), provider: asString(firstValue(value, ['provider', 'provider_name', 'providerName', 'name']), `Provider ${id}`), price: asNumber(firstValue(value, ['price', 'amount', 'user_price', 'userPrice'])), status, available };
}

export function normalizeExamProducts(payload: unknown) {
  return extractArray(payload).map(normalizeExamProduct).filter((item): item is NonNullable<typeof item> => item !== null);
}

function normalizeUtilityProvider(value: unknown) {
  if (!isRecord(value)) return null;
  const id = firstValue(value, ['id', 'providerid', 'provider_id', 'providerId']);
  if (id === undefined) return null;
  const status = asString(firstValue(value, ['status', 'state', 'availability']), '');
  return { id: typeof id === 'number' ? id : String(id), name: asString(firstValue(value, ['provider', 'provider_name', 'providerName', 'name', 'network']), `Provider ${id}`), status, available: !status || /^(on|active|available|enabled|success|successful)$/i.test(status) };
}

export function normalizeUtilityProviders(payload: unknown) {
  return extractArray(payload).map(normalizeUtilityProvider).filter((item): item is NonNullable<typeof item> => item !== null);
}

export function getSupplierTransactionStatus(payload: unknown): 'successful' | 'failed' | 'processing' | 'unknown' {
  const values: string[] = [];
  const visit = (value: unknown, depth: number) => {
    if (depth > 5 || value === null || value === undefined) return;
    if (Array.isArray(value)) {
      value.slice(0, 20).forEach(item => visit(item, depth + 1));
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
