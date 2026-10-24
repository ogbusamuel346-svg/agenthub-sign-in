import { createRemoteJWKSet, jwtVerify } from 'jose';
import { verifyPaystackTransaction } from '../shared/paystack';
import { isValidPaystackWebhookSignature, makeWebhookEventKey, validateSuccessfulPaystackTransaction } from '../shared/walletSecurity';
import { getSupplierTransactionStatus, normalizeDataPlans, normalizeNetworks, normalizeExamProducts, normalizeUtilityProviders } from './catalog';

export interface Env {
  DB: {
    prepare(query: string): {
      bind(...values: unknown[]): {
        first<T = unknown>(): Promise<T | null>;
        run(): Promise<unknown>;
        all<T = Record<string, unknown>>(): Promise<{ results: T[] }>;
      };
      first<T = unknown>(): Promise<T | null>;
      all<T = Record<string, unknown>>(): Promise<{ results: T[] }>;
    };
    batch(statements: unknown[]): Promise<unknown[]>;
  };
  ASSETS: { fetch(request: Request): Promise<Response> };
  PAYSTACK_SECRET_KEY?: string;
  PAYSTACK_MODE?: string;
  TOPUPMATE_API_BASE_URL?: string;
  TOPUPMATE_API_TOKEN?: string;
  TOPUPMATE_MODE?: string;
  TOPUPMATE_REQUEST_TIMEOUT_MS?: string;
  TOPUPMATE_PURCHASES_ENABLED?: string;
  TOPUPMATE_ADMIN_VIEW_TOKEN?: string;
  FIREBASE_PROJECT_ID?: string;
  PAYSTACK_FRONTEND_RETURN_URL?: string;
  CLOUDFLARE_WALLET_CUTOVER?: string;
  CLOUDFLARE_FUNDING_ENABLED?: string;
  SUPPORT_EMAIL?: string;
  SUPPORT_FROM_EMAIL?: string;
  SUPPORT_MAILER: {
    send(message: {
      to: string;
      from: string;
      subject: string;
      text: string;
      replyTo?: string;
    }): Promise<{ messageId: string }>;
  };
}

const json = (body: unknown, status = 200) => Response.json(body, { status });

type FirebaseClaims = { user_id?: unknown; admin?: unknown };
const firebaseKeys = createRemoteJWKSet(new URL('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com'));

async function firebaseUser(request: Request, projectId: string) {
  const token = request.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return null;
  try {
    const now = Math.floor(Date.now() / 1000);
    const { payload } = await jwtVerify(token, firebaseKeys, {
      algorithms: ['RS256'],
      audience: projectId,
      issuer: `https://securetoken.google.com/${projectId}`,
      clockTolerance: 60,
    });
    const claims = payload as typeof payload & FirebaseClaims;
    if (typeof claims.sub !== 'string' || !claims.sub || claims.sub !== claims.user_id || typeof claims.iat !== 'number' || claims.iat > now + 60) return null;
    return { uid: claims.sub, email: typeof claims.email === 'string' ? claims.email : undefined, emailVerified: claims.email_verified === true, name: typeof claims.name === 'string' ? claims.name : undefined, admin: claims.admin === true };
  } catch {
    return null;
  }
}

async function authenticatedReadiness(request: Request, env: Env) {
  if (!env.FIREBASE_PROJECT_ID) return json({ error: { code: 'AUTH_NOT_CONFIGURED', message: 'Firebase token verification is not configured.' } }, 503);
  const user = await firebaseUser(request, env.FIREBASE_PROJECT_ID);
  if (!user) return json({ error: { code: 'AUTHENTICATION_REQUIRED', message: 'A valid Firebase ID token is required.' } }, 401);
  try {
    await env.DB.prepare('SELECT 1').first();
    return json({ ok: true, provider: 'cloudflare', database: 'connected', identity: { uid: user.uid, email: user.email, emailVerified: user.emailVerified } });
  } catch {
    return json({ error: { code: 'DATABASE_UNAVAILABLE', message: 'The Cloudflare data service is unavailable.' } }, 503);
  }
}

async function accountReconciliation(request: Request, env: Env) {
  const auth = await requireUser(request, env);
  if (!auth.user) return auth.response!;
  try {
    const uid = auth.user.uid;
    const [wallet, funding, ledger, entries, services] = await Promise.all([
      env.DB.prepare('SELECT balance_minor FROM wallets WHERE user_id=?').bind(uid).first<{ balance_minor: number }>(),
      env.DB.prepare("SELECT status,COUNT(*) AS count,SUM(amount_minor) AS total_minor,SUM(CASE WHEN provider_transaction_id IS NULL OR TRIM(provider_transaction_id)='' THEN 1 ELSE 0 END) AS missing_provider_id FROM wallet_funding_transactions WHERE user_id=? GROUP BY status").bind(uid).all<Record<string, unknown>>(),
      env.DB.prepare('SELECT COUNT(*) AS count,COALESCE(SUM(amount_minor),0) AS total_minor FROM wallet_ledger WHERE user_id=?').bind(uid).first<Record<string, unknown>>(),
      env.DB.prepare('SELECT entry_type,COUNT(*) AS count,COALESCE(SUM(amount_minor),0) AS total_minor FROM wallet_entries WHERE user_id=? GROUP BY entry_type').bind(uid).all<Record<string, unknown>>(),
      env.DB.prepare("SELECT status,COUNT(*) AS count,SUM(total_amount_minor) AS total_minor,SUM(CASE WHEN debited_at IS NULL THEN 1 ELSE 0 END) AS missing_debit_marker,SUM(CASE WHEN status='failed' AND debited_at IS NOT NULL AND refunded_at IS NULL THEN 1 ELSE 0 END) AS failed_without_refund_marker FROM service_transactions WHERE user_id=? GROUP BY status").bind(uid).all<Record<string, unknown>>(),
    ]);
    return json({ ok: true, currency: 'NGN', walletBalanceMinor: Number(wallet?.balance_minor || 0), fundingByStatus: funding.results, fundingLedger: ledger, walletEntriesByType: entries.results, servicesByStatus: services.results, cutoverEnabled: env.CLOUDFLARE_WALLET_CUTOVER === 'true' });
  } catch {
    return json({ error: { code: 'RECONCILIATION_UNAVAILABLE', message: 'Account reconciliation data is temporarily unavailable.' } }, 503);
  }
}

async function syncFirebaseProfile(request: Request, env: Env) {
  if (!env.FIREBASE_PROJECT_ID) return json({ error: { code: 'AUTH_NOT_CONFIGURED', message: 'Firebase token verification is not configured.' } }, 503);
  const user = await firebaseUser(request, env.FIREBASE_PROJECT_ID);
  if (!user) return json({ error: { code: 'AUTHENTICATION_REQUIRED', message: 'A valid Firebase ID token is required.' } }, 401);
  if (!user.email) return json({ error: { code: 'EMAIL_REQUIRED', message: 'An account email is required.' } }, 400);
  const now = Date.now();
  try {
    const knownEmail = await env.DB.prepare('SELECT id FROM users WHERE email = ? COLLATE NOCASE AND id <> ?').bind(user.email.toLowerCase(), user.uid).first();
    if (knownEmail) return json({ error: { code: 'PROFILE_EMAIL_CONFLICT', message: 'This email is already mapped to a different account.' } }, 409);
    await env.DB.prepare("INSERT INTO users (id, email, display_name, email_verified, identity_provider, created_at, updated_at) VALUES (?, ?, ?, ?, 'firebase', ?, ?) ON CONFLICT(id) DO UPDATE SET email = excluded.email, display_name = excluded.display_name, email_verified = excluded.email_verified, updated_at = excluded.updated_at").bind(user.uid, user.email.toLowerCase(), user.name || null, user.emailVerified ? 1 : 0, now, now).run();
    return json({ ok: true, identityProvider: 'firebase', profileStored: true });
  } catch {
    return json({ error: { code: 'PROFILE_SYNC_FAILED', message: 'The Cloudflare profile could not be synchronized.' } }, 503);
  }
}

async function requireUser(request: Request, env: Env) {
  if (!env.FIREBASE_PROJECT_ID) return { response: json({ error: { code: 'AUTH_NOT_CONFIGURED', message: 'Firebase token verification is not configured.' } }, 503) };
  const user = await firebaseUser(request, env.FIREBASE_PROJECT_ID);
  if (!user) return { response: json({ error: { code: 'AUTHENTICATION_REQUIRED', message: 'A valid Firebase ID token is required.' } }, 401) };
  return { user };
}

async function adminOverview(request: Request, env: Env) {
  const auth = await requireUser(request, env);
  if (!auth.user) return auth.response!;
  if (auth.user.admin !== true) return json({ error: { code: 'ADMIN_ACCESS_REQUIRED', message: 'You are not authorized to view the admin dashboard.' } }, 403);

  try {
    const [users, wallet, funding, purchases, recentActivity] = await Promise.all([
      env.DB.prepare('SELECT COUNT(*) AS total FROM users').first<{ total: number }>(),
      env.DB.prepare('SELECT COALESCE(SUM(balance_minor), 0) AS total_balance_minor FROM wallets').first<{ total_balance_minor: number }>(),
      env.DB.prepare('SELECT status, COUNT(*) AS count, COALESCE(SUM(amount_minor), 0) AS amount_minor FROM wallet_funding_transactions GROUP BY status ORDER BY status').all<Record<string, unknown>>(),
      env.DB.prepare('SELECT status, COUNT(*) AS count, COALESCE(SUM(total_amount_minor), 0) AS amount_minor FROM service_transactions GROUP BY status ORDER BY status').all<Record<string, unknown>>(),
      env.DB.prepare("SELECT activity.kind, activity.reference, activity.email, activity.status, activity.amount_minor, activity.created_at FROM (SELECT 'wallet_funding' AS kind, f.tx_ref AS reference, u.email AS email, f.status AS status, f.amount_minor AS amount_minor, f.created_at AS created_at FROM wallet_funding_transactions f JOIN users u ON u.id=f.user_id UNION ALL SELECT s.service AS kind, s.reference AS reference, u.email AS email, s.status AS status, s.total_amount_minor AS amount_minor, s.created_at AS created_at FROM service_transactions s JOIN users u ON u.id=s.user_id) activity ORDER BY activity.created_at DESC LIMIT 10").all<Record<string, unknown>>(),
    ]);
    const safeNumber = (value: unknown) => Number.isSafeInteger(Number(value)) && Number(value) >= 0 ? Number(value) : 0;
    return json({
      ok: true,
      overview: {
        totalUsers: safeNumber(users?.total),
        walletLiabilityMinor: safeNumber(wallet?.total_balance_minor),
        fundingByStatus: funding.results,
        purchasesByStatus: purchases.results,
        recentActivity: recentActivity.results,
      },
    });
  } catch {
    return json({ error: { code: 'ADMIN_OVERVIEW_UNAVAILABLE', message: 'Admin dashboard data is temporarily unavailable.' } }, 503);
  }
}

async function getD1Wallet(request: Request, env: Env) {
  const auth = await requireUser(request, env);
  if (!auth.user) return auth.response!;
  const wallet = await env.DB.prepare('SELECT balance_minor FROM wallets WHERE user_id = ?').bind(auth.user.uid).first<{ balance_minor: number }>();
  const candidate = wallet?.balance_minor;
  const balanceMinor = Number.isSafeInteger(candidate) && Number(candidate) >= 0 ? Number(candidate) : 0;
  return json({ balanceMinor, balance: (balanceMinor / 100).toFixed(2), currency: 'NGN' });
}

async function getD1Funding(request: Request, env: Env, txRef: string) {
  const auth = await requireUser(request, env);
  if (!auth.user) return auth.response!;
  if (!/^[A-Za-z0-9_-]{12,160}$/.test(txRef)) return json({ error: { code: 'INVALID_REFERENCE', message: 'Invalid funding reference.' } }, 400);
  const record = await env.DB.prepare('SELECT tx_ref, user_id, amount_minor, currency, status, provider_transaction_id, created_at, updated_at FROM wallet_funding_transactions WHERE tx_ref = ?').bind(txRef).first<{ tx_ref: string; user_id: string; amount_minor: number; currency: string; status: string; provider_transaction_id: string | null; created_at: number; updated_at: number }>();
  if (!record) return json({ error: { code: 'FUNDING_NOT_FOUND', message: 'The wallet funding reference was not found.' } }, 404);
  if (record.user_id !== auth.user.uid) return json({ error: { code: 'FUNDING_FORBIDDEN', message: 'You are not authorized to view this funding attempt.' } }, 403);
  return json({ txRef: record.tx_ref, amount: record.amount_minor / 100, currency: record.currency, status: record.status, providerTransactionId: record.provider_transaction_id, createdAt: record.created_at, updatedAt: record.updated_at });
}

function secretMatches(expected: string, supplied: string) {
  const encoder = new TextEncoder();
  const left = encoder.encode(expected);
  const right = encoder.encode(supplied);
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index++) difference |= left[index] ^ right[index];
  return difference === 0;
}

function requireSupplierAdmin(request: Request, env: Env) {
  const expected = env.TOPUPMATE_ADMIN_VIEW_TOKEN?.trim();
  if (!expected) return json({ error: { code: 'ADMIN_VIEW_NOT_CONFIGURED', message: 'Supplier admin endpoints are not configured.' } }, 503);
  const supplied = request.headers.get('x-topupmate-admin-token')?.trim() || '';
  if (!secretMatches(expected, supplied)) return json({ error: { code: 'UNAUTHORIZED', message: 'Not authorized to view supplier account data.' } }, 401);
  return null;
}

async function internalSupplierBalance(request: Request, env: Env) {
  const denied = requireSupplierAdmin(request, env);
  if (denied) return denied;
  try {
    const payload = await topupmateRequest(env, '/user/');
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error('invalid supplier response');
    const supplier = payload as Record<string, unknown>;
    const raw = supplier.balance;
    const balance = typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(raw.replace(/[,₦\s]/g, '')) : NaN;
    if (!Number.isFinite(balance) || balance < 0) throw new Error('invalid supplier balance');
    const number = (value: unknown) => {
      const candidate = typeof value === 'number' ? value : typeof value === 'string' ? Number(value.replace(/[,₦\s]/g, '')) : NaN;
      return Number.isFinite(candidate) ? candidate : null;
    };
    return json({ balance, currency: 'NGN', status: typeof supplier.status === 'string' ? supplier.status : 'unknown', usdBalance: number(supplier.usdbalance), usdDueBalance: number(supplier.usdduebalance), supplier });
  } catch {
    return json({ error: { code: 'TOPUPMATE_BALANCE_UNAVAILABLE', message: 'The supplier balance could not be loaded.' } }, 502);
  }
}

async function internalSupplierTransactionStatus(request: Request, env: Env) {
  const denied = requireSupplierAdmin(request, env);
  if (denied) return denied;
  const reference = new URL(request.url).searchParams.get('reference')?.trim() || '';
  if (!/^[a-z0-9][a-z0-9_.:-]{5,120}$/i.test(reference)) return json({ error: { code: 'INVALID_REQUEST', message: 'A valid transaction reference is required.' } }, 400);
  try {
    const supplier = await topupmateRequest(env, `/transaction/status/?reference=${encodeURIComponent(reference)}`);
    const providerStatus = getSupplierTransactionStatus(supplier);
    if (providerStatus === 'unknown') return json({ error: { code: 'TOPUPMATE_INVALID_RESPONSE', message: 'TopupMate returned an unrecognized transaction status.' } }, 502);
    return json({ reference, status: providerStatus === 'processing' ? 'pending' : providerStatus, providerStatus, checkedAt: new Date().toISOString(), supplier });
  } catch {
    return json({ error: { code: 'TOPUPMATE_STATUS_UNAVAILABLE', message: 'The supplier transaction status could not be loaded.' } }, 502);
  }
}

async function getD1TransactionStatus(request: Request, env: Env) {
  const auth = await requireUser(request, env);
  if (!auth.user) return auth.response!;
  const reference = new URL(request.url).searchParams.get('reference')?.trim() || '';
  if (!/^[a-z0-9][a-z0-9_.:-]{5,120}$/i.test(reference)) return json({ error: { code: 'INVALID_REQUEST', message: 'A valid transaction reference is required.' } }, 400);
  const record = await env.DB.prepare('SELECT service, provider_id, provider_name, quantity, unit_price_minor, total_amount_minor, currency, status, provider_status, pins_json, failure_code, created_at, updated_at, debited_at, refunded_at FROM service_transactions WHERE user_id=? AND reference=?').bind(auth.user.uid, reference).first<Record<string, unknown>>();
  if (!record) return json({ error: { code: 'TRANSACTION_NOT_FOUND', message: 'No transaction with this reference belongs to your account.' } }, 404);
  try {
    const supplier = await topupmateRequest(env, `/transaction/status/?reference=${encodeURIComponent(reference)}`);
    const providerStatus = getSupplierTransactionStatus(supplier);
    if (providerStatus === 'unknown') return json({ error: { code: 'TOPUPMATE_INVALID_RESPONSE', message: 'TopupMate returned an unrecognized transaction status.' } }, 502);
    let status = String(record.status);
    const now = Date.now();
    const delivery = collectPins(supplier);
    if (providerStatus === 'successful' && status !== 'failed') {
      status = 'successful';
      await env.DB.prepare("UPDATE service_transactions SET status='successful', provider_status=?, pins_json=COALESCE(?, pins_json), updated_at=? WHERE user_id=? AND reference=? AND status<>'failed'").bind(providerStatus, delivery.length ? JSON.stringify(delivery) : null, now, auth.user.uid, reference).run();
    } else if (providerStatus === 'failed' && status !== 'successful') {
      const refundRequest = new Request(request.url, { method: 'POST', headers: request.headers, body: JSON.stringify({ reference, failureCode: 'TOPUPMATE_PURCHASE_FAILED' }) });
      await refundD1Service(refundRequest, env);
      status = 'failed';
    } else if (providerStatus === 'processing' && status === 'processing') {
      status = 'pending';
      await env.DB.prepare("UPDATE service_transactions SET status='pending', provider_status=?, updated_at=? WHERE user_id=? AND reference=? AND status='processing'").bind(providerStatus, now, auth.user.uid, reference).run();
    }
    let savedDelivery: unknown = [];
    try { savedDelivery = record.pins_json ? JSON.parse(String(record.pins_json)) : []; } catch { savedDelivery = []; }
    const transaction = { reference, service: record.service, product: { id: record.provider_id, provider: record.provider_name }, providerId: record.provider_id, providerName: record.provider_name, quantity: record.quantity, unitPrice: Number(record.unit_price_minor) / 100, totalAmount: Number(record.total_amount_minor) / 100, currency: record.currency, status, providerStatus, hasDelivery: status === 'successful' && ((Array.isArray(savedDelivery) && savedDelivery.length > 0) || delivery.length > 0), failureCode: record.failure_code || null, createdAt: record.created_at, updatedAt: now, debitedAt: record.debited_at || null, refundedAt: record.refunded_at || null };
    return json({ reference, status, providerStatus, transaction, checkedAt: new Date().toISOString() });
  } catch {
    return json({ error: { code: 'TOPUPMATE_STATUS_UNAVAILABLE', message: 'The transaction status could not be reconciled.' } }, 502);
  }
}

async function listD1Transactions(request: Request, env: Env) {
  const auth = await requireUser(request, env);
  if (!auth.user) return auth.response!;
  const [serviceResult, fundingResult] = await Promise.all([
    env.DB.prepare('SELECT reference, service, provider_id, provider_name, quantity, unit_price_minor, total_amount_minor, currency, status, provider_status, pins_json, failure_code, created_at, updated_at, debited_at, refunded_at FROM service_transactions WHERE user_id = ? ORDER BY created_at DESC LIMIT 50').bind(auth.user.uid).all<Record<string, unknown>>(),
    env.DB.prepare('SELECT tx_ref, amount_minor, currency, status, provider_transaction_id, failure_code, created_at, updated_at, credited_at FROM wallet_funding_transactions WHERE user_id = ? ORDER BY created_at DESC LIMIT 50').bind(auth.user.uid).all<Record<string, unknown>>(),
  ]);
  const serviceTransactions = serviceResult.results.map(row => ({
    kind: 'service_purchase',
    reference: row.reference, service: row.service,
    product: { id: row.provider_id, provider: row.provider_name },
    providerId: row.provider_id, providerName: row.provider_name, quantity: row.quantity,
    unitPrice: Number(row.unit_price_minor) / 100, totalAmount: Number(row.total_amount_minor) / 100,
    currency: row.currency, status: row.status, providerStatus: row.provider_status || null,
    hasDelivery: ['exam-pin', 'electricity'].includes(String(row.service)) && row.status === 'successful' && Boolean(row.pins_json && (() => { try { const values = JSON.parse(String(row.pins_json)); return Array.isArray(values) && values.length > 0; } catch { return false; } })()), failureCode: row.failure_code || null,
    createdAt: row.created_at, updatedAt: row.updated_at, debitedAt: row.debited_at || null, refundedAt: row.refunded_at || null,
  }));
  const fundingTransactions = fundingResult.results.map(row => ({
    kind: 'wallet_funding',
    reference: row.tx_ref,
    service: 'wallet_funding',
    product: { id: 'wallet', provider: 'Wallet top-up' },
    providerId: 'wallet',
    providerName: 'Wallet top-up',
    quantity: 1,
    unitPrice: Number(row.amount_minor) / 100,
    totalAmount: Number(row.amount_minor) / 100,
    currency: row.currency,
    status: row.status === 'successful' ? 'successful' : row.status === 'failed' ? 'failed' : 'pending',
    providerStatus: null,
    pins: [],
    failureCode: row.failure_code || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    debitedAt: null,
    refundedAt: null,
    creditedAt: row.credited_at || null,
    providerTransactionId: row.provider_transaction_id || null,
  }));
  const transactions = [...serviceTransactions, ...fundingTransactions]
    .sort((a, b) => Number(b.createdAt) - Number(a.createdAt))
    .slice(0, 50);
  return json({ transactions });
}

async function getD1TransactionDelivery(request: Request, env: Env, reference: string) {
  const auth = await requireUser(request, env);
  if (!auth.user) return auth.response!;
  if (!/^[a-z0-9][a-z0-9_.:-]{5,120}$/i.test(reference)) return json({ error: { code: 'INVALID_REQUEST', message: 'A valid transaction reference is required.' } }, 400);
  const record = await env.DB.prepare('SELECT service, status, pins_json FROM service_transactions WHERE user_id=? AND reference=?').bind(auth.user.uid, reference).first<{ service: string; status: string; pins_json: string | null }>();
  if (!record) return json({ error: { code: 'TRANSACTION_NOT_FOUND', message: 'No transaction with this reference belongs to your account.' } }, 404);
  if (!['exam-pin', 'electricity'].includes(record.service)) return json({ error: { code: 'DELIVERY_NOT_SUPPORTED', message: 'This transaction does not have a downloadable product.' } }, 409);
  if (record.status !== 'successful') return json({ error: { code: 'DELIVERY_NOT_READY', message: 'The supplier has not confirmed this transaction yet.' } }, 409);
  let values: unknown;
  try { values = record.pins_json ? JSON.parse(record.pins_json) : []; } catch { values = []; }
  const delivery = Array.isArray(values) ? values.filter((value): value is string => typeof value === 'string' && Boolean(value.trim())).map(value => value.trim()) : [];
  if (!delivery.length) return json({ error: { code: 'DELIVERY_NOT_READY', message: 'The supplier has not returned a PIN or token for this transaction yet.' } }, 409);
  return json({ reference, service: record.service, delivery });
}

function requireEnv(env: Env, key: keyof Env) {
  const value = env[key];
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${String(key)} is not configured.`);
  return value.trim();
}

function paystackSecret(env: Env) {
  const secret = requireEnv(env, 'PAYSTACK_SECRET_KEY');
  const mode = env.PAYSTACK_MODE;
  const isTestKey = secret.startsWith('sk_test_');
  const isLiveKey = secret.startsWith('sk_live_');
  if ((mode !== 'test' && mode !== 'live') || (mode === 'test' && !isTestKey) || (mode === 'live' && !isLiveKey)) {
    throw new Error('Paystack mode does not match its secret key.');
  }
  return secret;
}

function paystackReady(env: Env, expectedMode?: 'test' | 'live') {
  try {
    paystackSecret(env);
    return expectedMode === undefined || env.PAYSTACK_MODE === expectedMode;
  } catch {
    return false;
  }
}

function topupmateUrlMatchesMode(env: Env, mode: 'sandbox' | 'live') {
  if (!env.TOPUPMATE_API_BASE_URL) return false;
  try {
    const url = new URL(env.TOPUPMATE_API_BASE_URL);
    return url.protocol === 'https:'
      && url.hostname === 'connect.topupmate.com'
      && url.pathname.replace(/\/+$/, '') === (mode === 'sandbox' ? '/sandbox' : '/api');
  } catch {
    return false;
  }
}

function livePurchasesReady(env: Env) {
  return env.CLOUDFLARE_WALLET_CUTOVER === 'true'
    && env.TOPUPMATE_PURCHASES_ENABLED === 'true'
    && env.TOPUPMATE_MODE === 'live'
    && topupmateUrlMatchesMode(env, 'live')
    && Boolean(env.TOPUPMATE_API_TOKEN?.trim())
    && paystackReady(env, 'live');
}

async function createD1Funding(request: Request, env: Env) {
  if (env.CLOUDFLARE_FUNDING_ENABLED !== 'true') return json({ error: { code: 'CLOUDFLARE_FUNDING_DISABLED', message: 'Wallet funding is not enabled in this environment.' } }, 503);
  let paystackKey: string;
  try {
    paystackKey = paystackSecret(env);
  } catch {
    return json({ error: { code: 'PAYSTACK_NOT_READY', message: 'Paystack credentials are missing or do not match this environment.' } }, 503);
  }
  const auth = await requireUser(request, env);
  if (!auth.user) return auth.response!;
  if (!auth.user.email) return json({ error: { code: 'AUTH_EMAIL_REQUIRED', message: 'Your Firebase account must have an email address.' } }, 400);
  const body = await request.json().catch(() => null) as { amount?: unknown } | null;
  const rawAmount = typeof body?.amount === 'number' ? String(body.amount) : typeof body?.amount === 'string' ? body.amount.trim() : '';
  if (!/^\d+(?:\.\d{1,2})?$/.test(rawAmount)) return json({ error: { code: 'INVALID_AMOUNT', message: 'Enter a positive NGN amount with up to two decimal places.' } }, 400);
  const amountMinor = Math.round(Number(rawAmount) * 100);
  if (!Number.isSafeInteger(amountMinor) || amountMinor <= 0) return json({ error: { code: 'INVALID_AMOUNT', message: 'Amount must be greater than zero.' } }, 400);
  const txRef = `WALLET-${Date.now()}-${crypto.randomUUID().replace(/-/g, '').toUpperCase()}`;
  const now = Date.now();
  const email = auth.user.email.trim().toLowerCase();
  const customerName = auth.user.name?.trim() || email.split('@')[0];
  const callbackUrl = new URL('/api/cloudflare/paystack/callback', request.url).toString();
  await env.DB.prepare("INSERT INTO users (id, email, display_name, email_verified, identity_provider, created_at, updated_at) VALUES (?, ?, ?, ?, 'firebase', ?, ?) ON CONFLICT(id) DO UPDATE SET email=excluded.email, display_name=excluded.display_name, email_verified=excluded.email_verified, updated_at=excluded.updated_at").bind(auth.user.uid, email, customerName, auth.user.emailVerified ? 1 : 0, now, now).run();
  await env.DB.prepare("INSERT INTO wallets (user_id, balance_minor, updated_at) VALUES (?, 0, ?) ON CONFLICT(user_id) DO NOTHING").bind(auth.user.uid, now).run();
  await env.DB.prepare("INSERT INTO wallet_funding_transactions (tx_ref, user_id, amount_minor, currency, customer_email, customer_name, status, created_at, updated_at) VALUES (?, ?, ?, 'NGN', ?, ?, 'pending', ?, ?)").bind(txRef, auth.user.uid, amountMinor, email, customerName, now, now).run();
  try {
    const response = await fetch('https://api.paystack.co/transaction/initialize', {
      method: 'POST',
      headers: { Authorization: `Bearer ${paystackKey}`, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ reference: txRef, amount: String(amountMinor), currency: 'NGN', email, callback_url: callbackUrl, metadata: { user_id: auth.user.uid } }),
    });
    const payload = await response.json().catch(() => null) as { status?: boolean; data?: { authorization_url?: string; reference?: string } } | null;
    const checkoutUrl = payload?.data?.authorization_url;
    if (!response.ok || payload?.status !== true || payload.data?.reference !== txRef || !checkoutUrl?.startsWith('https://checkout.paystack.com/')) throw new Error('Paystack checkout could not be created.');
    await env.DB.prepare("UPDATE wallet_funding_transactions SET status='checkout_created', checkout_url=?, updated_at=? WHERE tx_ref=? AND status='pending'").bind(checkoutUrl, Date.now(), txRef).run();
    return json({ txRef, amount: amountMinor / 100, currency: 'NGN', status: 'checkout_created', checkoutUrl }, 201);
  } catch {
    await env.DB.prepare("UPDATE wallet_funding_transactions SET status='failed', failure_code='CHECKOUT_REQUEST_FAILED', updated_at=? WHERE tx_ref=? AND status='pending'").bind(Date.now(), txRef).run();
    return json({ error: { code: 'PAYSTACK_REQUEST_FAILED', message: 'Paystack could not process the wallet funding request.' } }, 502);
  }
}

async function creditD1Funding(env: Env, txRef: string, expectedTransactionId?: string) {
  if (!/^[A-Za-z0-9_.=-]{12,160}$/.test(txRef)) throw new Error('invalid transaction reference');
  const record = await env.DB.prepare('SELECT tx_ref, user_id, amount_minor, currency, customer_email, customer_name, status, created_at, updated_at FROM wallet_funding_transactions WHERE tx_ref=?').bind(txRef).first<{ tx_ref: string; user_id: string; amount_minor: number; currency: 'NGN'; customer_email: string; customer_name: string; status: string; created_at: number; updated_at: number }>();
  if (!record) return { status: 'ignored' };
  if (record.status === 'successful') return { status: 'already_processed' };
  const transaction = await verifyPaystackTransaction(record.tx_ref, paystackSecret(env));
  if (expectedTransactionId && transaction.id !== expectedTransactionId) throw new Error('provider transaction ID mismatch');
  validateSuccessfulPaystackTransaction({ txRef: record.tx_ref, amountMinor: record.amount_minor, customerEmail: record.customer_email }, transaction);
  const now = Date.now();
  const entryId = `funding:${crypto.randomUUID()}`;
  const credit = await env.DB.batch([
    env.DB.prepare("INSERT INTO wallet_ledger (id, user_id, tx_ref, amount_minor, currency, provider_transaction_id, created_at) SELECT ?, ?, ?, ?, 'NGN', ?, ? WHERE EXISTS (SELECT 1 FROM wallet_funding_transactions WHERE tx_ref=? AND status<>'successful') ON CONFLICT(tx_ref) DO NOTHING").bind(entryId, record.user_id, record.tx_ref, record.amount_minor, transaction.id, now, record.tx_ref),
    env.DB.prepare('UPDATE wallets SET balance_minor=balance_minor+?, updated_at=? WHERE user_id=? AND EXISTS (SELECT 1 FROM wallet_ledger WHERE id=? AND tx_ref=? AND provider_transaction_id=?)').bind(record.amount_minor, now, record.user_id, entryId, record.tx_ref, transaction.id),
    env.DB.prepare("UPDATE wallet_funding_transactions SET status='successful', provider_transaction_id=?, credited_at=?, updated_at=? WHERE tx_ref=? AND status<>'successful' AND EXISTS (SELECT 1 FROM wallet_ledger WHERE id=? AND tx_ref=? AND provider_transaction_id=?)").bind(transaction.id, now, now, record.tx_ref, entryId, record.tx_ref, transaction.id),
  ]);
  const ledgerInserted = credit[0] as { meta?: { changes?: number } };
  if (ledgerInserted.meta?.changes !== 1) return { status: 'already_processed' };
  return { status: 'successful' };
}

async function paystackWebhook(request: Request, env: Env) {
  if (env.CLOUDFLARE_FUNDING_ENABLED !== 'true') return new Response(null, { status: 404 });
  const rawBody = new Uint8Array(await request.arrayBuffer());
  if (!isValidPaystackWebhookSignature(request.headers.get('x-paystack-signature') || undefined, env.PAYSTACK_SECRET_KEY, rawBody)) return new Response(null, { status: 401 });
  let payload: { event?: unknown; data?: { id?: unknown; reference?: unknown; status?: unknown } } | null = null;
  try { payload = JSON.parse(new TextDecoder().decode(rawBody)); } catch { return json({ ok: false }, 400); }
  const event = typeof payload?.event === 'string' ? payload.event : '';
  const transactionId = payload?.data?.id === undefined ? '' : String(payload.data.id);
  const txRef = typeof payload?.data?.reference === 'string' ? payload.data.reference : '';
  const status = typeof payload?.data?.status === 'string' ? payload.data.status : '';
  if (event !== 'charge.success' || !transactionId || !txRef || status !== 'success') return json({ ok: true, status: 'ignored' });
  if (!/^\d+$/.test(transactionId)) return json({ ok: true, status: 'unsupported_transaction_format' });
  const eventKey = makeWebhookEventKey(event, transactionId, status);
  const seen = await env.DB.prepare('SELECT event_key FROM paystack_webhook_events WHERE event_key=?').bind(eventKey).first();
  if (seen) return json({ ok: true, status: 'already_processed' });
  try {
    const result = await creditD1Funding(env, txRef, transactionId);
    await env.DB.prepare('INSERT INTO paystack_webhook_events (event_key, event, transaction_id, tx_ref, status, received_at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(event_key) DO NOTHING').bind(eventKey, event, transactionId, txRef, status, Date.now()).run();
    return json({ ok: true, ...result });
  } catch {
    return json({ ok: false }, 500);
  }
}

async function fundingCallback(request: Request, env: Env) {
  if (env.CLOUDFLARE_FUNDING_ENABLED !== 'true') return json({ error: { code: 'CLOUDFLARE_FUNDING_DISABLED', message: 'Wallet funding is not enabled in this environment.' } }, 503);
  const url = new URL(request.url);
  const txRef = url.searchParams.get('reference') || url.searchParams.get('trxref') || '';
  const target = env.PAYSTACK_FRONTEND_RETURN_URL?.trim() || new URL('/', request.url).toString();
  const redirectToApp = (status: string, reference = txRef) => {
    const redirect = new URL(target);
    if (/^[A-Za-z0-9_-]{12,160}$/.test(reference)) redirect.searchParams.set('wallet_tx_ref', reference);
    redirect.searchParams.set('wallet_status', status);
    return Response.redirect(redirect.toString(), 303);
  };
  if (!/^[A-Za-z0-9_-]{12,160}$/.test(txRef)) return redirectToApp('unverified', '');
  try {
    const transaction = await verifyPaystackTransaction(txRef, paystackSecret(env));
    if (transaction.status === 'success') {
      const result = await creditD1Funding(env, txRef, transaction.id);
      return redirectToApp(result.status);
    }
    if (['failed', 'abandoned', 'reversed'].includes(transaction.status)) {
      await env.DB.prepare("UPDATE wallet_funding_transactions SET status='failed', failure_code='PAYMENT_NOT_SUCCESSFUL', updated_at=? WHERE tx_ref=? AND status<>'successful'").bind(Date.now(), txRef).run();
      return redirectToApp('failed');
    }
    return redirectToApp('pending');
  } catch (error) {
    // Keep provider and validation details out of the public callback response,
    // but retain a safe reason in Worker logs so failed legitimate payments can
    // be diagnosed without exposing credentials or transaction data to browsers.
    const candidateCode = error && typeof error === 'object' && 'code' in error && typeof error.code === 'string'
      ? error.code
      : undefined;
    const reason = candidateCode
      || (error instanceof Error && error.message === 'provider verification failed'
        ? 'PROVIDER_VERIFICATION_FAILED'
        : error instanceof Error && error.message === 'provider returned an incomplete verification response'
          ? 'INCOMPLETE_PROVIDER_RESPONSE'
          : 'VERIFICATION_FAILED');
    console.error('[wallet] Paystack callback verification failed', {
      reason,
    });
    return redirectToApp('pending');
  }
}

async function debitD1Service(request: Request, env: Env) {
  const auth = await requireUser(request, env);
  if (!auth.user) return auth.response!;
  const body = await request.json().catch(() => null) as { reference?: unknown; providerId?: unknown; providerName?: unknown; quantity?: unknown; unitPriceMinor?: unknown } | null;
  const reference = typeof body?.reference === 'string' ? body.reference : '';
  const providerName = typeof body?.providerName === 'string' ? body.providerName.slice(0, 160) : '';
  const providerId = typeof body?.providerId === 'string' || typeof body?.providerId === 'number' ? String(body.providerId) : '';
  const quantity = body?.quantity;
  const unitPriceMinor = body?.unitPriceMinor;
  const total = Number(quantity) * Number(unitPriceMinor);
  if (!/^[A-Za-z0-9_.:-]{6,121}$/.test(reference) || !providerName || !providerId || !Number.isSafeInteger(quantity) || Number(quantity) < 1 || !Number.isSafeInteger(unitPriceMinor) || Number(unitPriceMinor) < 1 || !Number.isSafeInteger(total)) return json({ error: { code: 'INVALID_REQUEST', message: 'Invalid service transaction request.' } }, 400);
  const now = Date.now();
  const record = await env.DB.prepare('SELECT status, provider_id, quantity, unit_price_minor FROM service_transactions WHERE user_id=? AND reference=?').bind(auth.user.uid, reference).first<{ status: string; provider_id: string; quantity: number; unit_price_minor: number }>();
  if (record) return json({ error: { code: 'REFERENCE_CONFLICT', message: 'This reference has already been used.' } }, 409);
  const marker = `debit:${crypto.randomUUID()}`;
  const debit = await env.DB.batch([
    env.DB.prepare("INSERT INTO wallet_entries (id, user_id, reference, entry_type, amount_minor, created_at) SELECT ?, ?, ?, 'service_debit', ?, ? WHERE EXISTS (SELECT 1 FROM wallets WHERE user_id=? AND balance_minor>=?) ON CONFLICT(user_id, reference, entry_type) DO NOTHING").bind(marker, auth.user.uid, reference, total, now, auth.user.uid, total),
    env.DB.prepare('UPDATE wallets SET balance_minor=balance_minor-?, updated_at=? WHERE user_id=? AND balance_minor>=? AND EXISTS (SELECT 1 FROM wallet_entries WHERE id=? AND reference=? AND created_at=?)').bind(total, now, auth.user.uid, total, marker, reference, now),
    env.DB.prepare("INSERT INTO service_transactions (user_id, reference, service, provider_id, provider_name, quantity, unit_price_minor, total_amount_minor, currency, status, created_at, updated_at, debited_at) SELECT ?, ?, 'exam-pin', ?, ?, ?, ?, ?, 'NGN', 'processing', ?, ?, ? WHERE EXISTS (SELECT 1 FROM wallet_entries WHERE id=? AND reference=? AND created_at=?) ON CONFLICT(user_id, reference) DO NOTHING").bind(auth.user.uid, reference, providerId, providerName, quantity, unitPriceMinor, total, now, now, now, marker, reference, now),
  ]);
  const inserted = debit[0] as { meta?: { changes?: number } };
  if (inserted.meta?.changes !== 1) return json({ error: { code: 'INSUFFICIENT_WALLET_BALANCE', message: 'Your wallet balance is insufficient or the request was already claimed.' } }, 402);
  return json({ ok: true, reference, status: 'processing', totalAmount: total / 100 }, 201);
}

async function refundD1Service(request: Request, env: Env) {
  const auth = await requireUser(request, env);
  if (!auth.user) return auth.response!;
  const body = await request.json().catch(() => null) as { reference?: unknown; failureCode?: unknown } | null;
  const reference = typeof body?.reference === 'string' ? body.reference : '';
  const failureCode = typeof body?.failureCode === 'string' ? body.failureCode.slice(0, 120) : 'PROVIDER_FAILED';
  if (!/^[A-Za-z0-9_.:-]{6,121}$/.test(reference)) return json({ error: { code: 'INVALID_REQUEST', message: 'Invalid service reference.' } }, 400);
  const record = await env.DB.prepare('SELECT total_amount_minor, status FROM service_transactions WHERE user_id=? AND reference=?').bind(auth.user.uid, reference).first<{ total_amount_minor: number; status: string }>();
  if (!record) return json({ error: { code: 'TRANSACTION_NOT_FOUND', message: 'Transaction not found.' } }, 404);
  if (record.status === 'successful') return json({ error: { code: 'TRANSACTION_FINAL', message: 'A successful transaction cannot be refunded.' } }, 409);
  const now = Date.now();
  const refundId = `refund:${crypto.randomUUID()}`;
  const refund = await env.DB.batch([
    env.DB.prepare("INSERT INTO wallet_entries (id, user_id, reference, entry_type, amount_minor, created_at) SELECT ?, ?, ?, 'service_refund', ?, ? WHERE EXISTS (SELECT 1 FROM wallet_entries WHERE user_id=? AND reference=? AND entry_type='service_debit') AND EXISTS (SELECT 1 FROM service_transactions WHERE user_id=? AND reference=? AND status<>'successful') ON CONFLICT(user_id, reference, entry_type) DO NOTHING").bind(refundId, auth.user.uid, reference, record.total_amount_minor, now, auth.user.uid, reference, auth.user.uid, reference),
    env.DB.prepare('UPDATE wallets SET balance_minor=balance_minor+?, updated_at=? WHERE user_id=? AND EXISTS (SELECT 1 FROM wallet_entries WHERE id=? AND reference=? AND entry_type=\'service_refund\')').bind(record.total_amount_minor, now, auth.user.uid, refundId, reference),
    env.DB.prepare("UPDATE service_transactions SET status='failed', failure_code=?, refunded_at=COALESCE(refunded_at, ?), updated_at=? WHERE user_id=? AND reference=? AND status<>'successful' AND EXISTS (SELECT 1 FROM wallet_entries WHERE id=? AND entry_type='service_refund')").bind(failureCode, now, now, auth.user.uid, reference, refundId),
  ]);
  return json({ ok: true, reference, status: 'failed', refunded: (refund[0] as { meta?: { changes?: number } }).meta?.changes === 1 });
}

function collectPins(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(collectPins);
  if (!value || typeof value !== 'object') return [];
  const record = value as Record<string, unknown>;
  const direct = ['pin', 'pins', 'serial', 'serial_number', 'serialNumber', 'token'];
  const found = direct.flatMap(key => {
    const item = record[key];
    return typeof item === 'string' && item.trim() ? [item.trim()] : Array.isArray(item) ? collectPins(item) : [];
  });
  return [...found, ...Object.entries(record).filter(([key]) => !direct.includes(key)).flatMap(([, item]) => collectPins(item))];
}

async function purchaseD1ExamPin(request: Request, env: Env) {
  const auth = await requireUser(request, env);
  if (!auth.user) return auth.response!;
  if (!livePurchasesReady(env)) {
    return json({ error: { code: 'EXAM_PURCHASES_DISABLED', message: 'Exam PIN purchases are temporarily unavailable. Your wallet has not been charged.' } }, 503);
  }
  const body = await request.json().catch(() => null) as { provider?: unknown; quantity?: unknown; ref?: unknown } | null;
  const providerId = typeof body?.provider === 'string' || typeof body?.provider === 'number' ? String(body.provider) : '';
  const quantity = Number(body?.quantity);
  const reference = typeof body?.ref === 'string' ? body.ref.trim() : '';
  if (!providerId || !Number.isInteger(quantity) || quantity < 1 || quantity > 20 || !/^[a-z0-9][a-z0-9_.:-]{5,120}$/i.test(reference)) {
    return json({ error: { code: 'INVALID_REQUEST', message: 'Choose a valid product and quantity, then retry the order.' } }, 400);
  }
  let product: ReturnType<typeof normalizeExamProducts>[number] | undefined;
  try {
    product = normalizeExamProducts(await topupmateRequest(env, '/services/?service=exampin')).find(item => String(item.id) === providerId);
  } catch {
    return json({ error: { code: 'EXAM_CATALOGUE_UNAVAILABLE', message: 'The exam PIN catalogue could not be loaded.' } }, 502);
  }
  if (!product?.available || product.price === null || product.price <= 0) return json({ error: { code: 'PRODUCT_NOT_AVAILABLE', message: 'The selected exam product is unavailable.' } }, 409);
  const unitMinor = Math.round(product.price * 100);
  const totalMinor = unitMinor * quantity;
  if (!Number.isSafeInteger(totalMinor) || totalMinor <= 0) return json({ error: { code: 'INVALID_PRICE', message: 'The product price is invalid.' } }, 502);
  const existing = await env.DB.prepare('SELECT service, provider_id, provider_name, quantity, unit_price_minor, total_amount_minor, status, pins_json FROM service_transactions WHERE user_id=? AND reference=?').bind(auth.user.uid, reference).first<Record<string, unknown>>();
  if (existing) {
    if (existing.service !== 'exam-pin' || String(existing.provider_id) !== providerId || Number(existing.quantity) !== quantity) return json({ error: { code: 'REFERENCE_CONFLICT', message: 'This order reference belongs to another purchase.' } }, 409);
    if (existing.status === 'failed') return json({ error: { code: 'PREVIOUS_ORDER_FAILED', message: 'This order failed and its wallet debit was refunded. Start a new order.' } }, 409);
    let delivery: unknown = [];
    try { delivery = existing.pins_json ? JSON.parse(String(existing.pins_json)) : []; } catch { delivery = []; }
    return json({ reference, status: existing.status === 'successful' ? 'successful' : 'pending', product: { id: existing.provider_id, provider: existing.provider_name }, quantity, unitPrice: Number(existing.unit_price_minor) / 100, totalAmount: Number(existing.total_amount_minor) / 100, hasDelivery: existing.status === 'successful' && Array.isArray(delivery) && delivery.length > 0, message: 'This order reference has already been recorded.' }, existing.status === 'successful' ? 200 : 202);
  }
  const now = Date.now();
  const entryId = `debit:${crypto.randomUUID()}`;
  const debit = await env.DB.batch([
    env.DB.prepare("INSERT INTO wallet_entries (id,user_id,reference,entry_type,amount_minor,created_at) SELECT ?,?,?, 'service_debit',?,? WHERE EXISTS (SELECT 1 FROM wallets WHERE user_id=? AND balance_minor>=?) ON CONFLICT(user_id,reference,entry_type) DO NOTHING").bind(entryId, auth.user.uid, reference, totalMinor, now, auth.user.uid, totalMinor),
    env.DB.prepare('UPDATE wallets SET balance_minor=balance_minor-?,updated_at=? WHERE user_id=? AND balance_minor>=? AND EXISTS (SELECT 1 FROM wallet_entries WHERE id=? AND reference=?)').bind(totalMinor, now, auth.user.uid, totalMinor, entryId, reference),
    env.DB.prepare("INSERT INTO service_transactions (user_id,reference,service,provider_id,provider_name,quantity,unit_price_minor,total_amount_minor,currency,status,created_at,updated_at,debited_at) SELECT ?,?, 'exam-pin',?,?,?,?,?,'NGN','processing',?,?,? WHERE EXISTS (SELECT 1 FROM wallet_entries WHERE id=? AND reference=?) ON CONFLICT(user_id,reference) DO NOTHING").bind(auth.user.uid, reference, providerId, product.provider, quantity, unitMinor, totalMinor, now, now, now, entryId, reference),
  ]);
  if (((debit[0] as { meta?: { changes?: number } }).meta?.changes || 0) !== 1) return json({ error: { code: 'INSUFFICIENT_WALLET_BALANCE', message: 'Your wallet balance is insufficient or this order was already claimed.' } }, 402);
  let supplier: unknown;
  try {
    supplier = await topupmateRequest(env, '/exampin/', 'POST', { provider: product.id, quantity, ref: reference });
  } catch {
    await env.DB.prepare("UPDATE service_transactions SET status='pending',failure_code='SUPPLIER_OUTCOME_UNCERTAIN',updated_at=? WHERE user_id=? AND reference=? AND status='processing'").bind(Date.now(), auth.user.uid, reference).run();
    return json({ reference, status: 'pending', product: { id: product.id, provider: product.provider }, quantity, unitPrice: product.price, totalAmount: product.price * quantity, hasDelivery: false, message: 'Your order is awaiting confirmation. Check its status before purchasing again.' }, 202);
  }
  const providerStatus = getSupplierTransactionStatus(supplier);
  if (providerStatus === 'failed') {
    const refundId = `refund:${crypto.randomUUID()}`;
    const refundedAt = Date.now();
    await env.DB.batch([
      env.DB.prepare("INSERT INTO wallet_entries (id,user_id,reference,entry_type,amount_minor,created_at) SELECT ?,?,?, 'service_refund',?,? WHERE EXISTS (SELECT 1 FROM wallet_entries WHERE user_id=? AND reference=? AND entry_type='service_debit') ON CONFLICT(user_id,reference,entry_type) DO NOTHING").bind(refundId, auth.user.uid, reference, totalMinor, refundedAt, auth.user.uid, reference),
      env.DB.prepare('UPDATE wallets SET balance_minor=balance_minor+?,updated_at=? WHERE user_id=? AND EXISTS (SELECT 1 FROM wallet_entries WHERE id=? AND reference=?)').bind(totalMinor, refundedAt, auth.user.uid, refundId, reference),
      env.DB.prepare("UPDATE service_transactions SET status='failed',provider_status='failed',failure_code='TOPUPMATE_PURCHASE_FAILED',refunded_at=?,updated_at=? WHERE user_id=? AND reference=? AND EXISTS (SELECT 1 FROM wallet_entries WHERE id=? AND reference=?)").bind(refundedAt, refundedAt, auth.user.uid, reference, refundId, reference),
    ]);
    return json({ error: { code: 'TOPUPMATE_PURCHASE_FAILED', message: 'The exam order failed. Your wallet was refunded.' } }, 502);
  }
  const pins = collectPins(supplier);
  const status = providerStatus === 'successful' ? 'successful' : 'pending';
  await env.DB.prepare('UPDATE service_transactions SET status=?,provider_status=?,pins_json=?,updated_at=? WHERE user_id=? AND reference=?').bind(status, providerStatus, JSON.stringify(pins), Date.now(), auth.user.uid, reference).run();
  return json({ reference, status, product: { id: product.id, provider: product.provider }, quantity, unitPrice: product.price, totalAmount: product.price * quantity, hasDelivery: status === 'successful' && pins.length > 0, message: pins.length ? 'Exam PINs were delivered by TopupMate.' : 'Your exam order is awaiting confirmation.' }, status === 'successful' ? 200 : 202);
}

async function purchaseD1Airtime(request: Request, env: Env) {
  const auth = await requireUser(request, env);
  if (!auth.user) return auth.response!;
  if (!livePurchasesReady(env)) {
    return json({ error: { code: 'AIRTIME_PURCHASES_DISABLED', message: 'Airtime purchases are temporarily unavailable. Your wallet has not been charged.' } }, 503);
  }
  const body = await request.json().catch(() => null) as { network?: unknown; amount?: unknown; phone?: unknown; ref?: unknown; airtime_type?: unknown } | null;
  const networkId = typeof body?.network === 'string' || typeof body?.network === 'number' ? String(body.network).trim() : '';
  const amount = typeof body?.amount === 'number' ? body.amount : typeof body?.amount === 'string' ? Number(body.amount) : NaN;
  const phone = typeof body?.phone === 'string' ? body.phone.replace(/[\s-]/g, '') : '';
  const reference = typeof body?.ref === 'string' ? body.ref.trim() : '';
  const airtimeType = typeof body?.airtime_type === 'string' ? body.airtime_type.trim() : 'VTU';
  if (!networkId || !Number.isFinite(amount) || amount <= 0 || !Number.isSafeInteger(Math.round(amount * 100)) || Math.abs(amount * 100 - Math.round(amount * 100)) > 1e-7 || !/^0\d{10}$/.test(phone) || !/^[a-z0-9][a-z0-9_.:-]{5,120}$/i.test(reference) || !['VTU', 'ShareNShare'].includes(airtimeType)) {
    return json({ error: { code: 'INVALID_REQUEST', message: 'Enter an available network, valid Nigerian phone number, positive amount and valid purchase reference.' } }, 400);
  }
  const amountMinor = Math.round(amount * 100);
  let network: ReturnType<typeof normalizeNetworks>[number] | undefined;
  try {
    network = normalizeNetworks(await topupmateRequest(env, '/services/?service=network')).find(item => String(item.id) === networkId);
  } catch {
    return json({ error: { code: 'AIRTIME_NETWORKS_UNAVAILABLE', message: 'The live airtime network list could not be checked.' } }, 502);
  }
  if (!network?.available) return json({ error: { code: 'NETWORK_NOT_AVAILABLE', message: 'The selected airtime network is unavailable.' } }, 409);

  const existing = await env.DB.prepare('SELECT service, provider_id, provider_name, quantity, unit_price_minor, total_amount_minor, status, pins_json FROM service_transactions WHERE user_id=? AND reference=?').bind(auth.user.uid, reference).first<Record<string, unknown>>();
  if (existing) {
    if (existing.service !== 'airtime' || String(existing.provider_id) !== networkId || Number(existing.total_amount_minor) !== amountMinor) return json({ error: { code: 'REFERENCE_CONFLICT', message: 'This order reference belongs to another purchase.' } }, 409);
    return json({ reference, status: existing.status === 'successful' ? 'successful' : existing.status, network: { id: networkId, name: String(existing.provider_name) }, amount: amountMinor / 100, message: 'This order reference has already been recorded.' }, existing.status === 'successful' ? 200 : 202);
  }

  const now = Date.now();
  const entryId = `debit:${crypto.randomUUID()}`;
  const debit = await env.DB.batch([
    env.DB.prepare("INSERT INTO wallet_entries (id,user_id,reference,entry_type,amount_minor,created_at) SELECT ?,?,?, 'service_debit',?,? WHERE EXISTS (SELECT 1 FROM wallets WHERE user_id=? AND balance_minor>=?) ON CONFLICT(user_id,reference,entry_type) DO NOTHING").bind(entryId, auth.user.uid, reference, amountMinor, now, auth.user.uid, amountMinor),
    env.DB.prepare('UPDATE wallets SET balance_minor=balance_minor-?,updated_at=? WHERE user_id=? AND balance_minor>=? AND EXISTS (SELECT 1 FROM wallet_entries WHERE id=? AND reference=?)').bind(amountMinor, now, auth.user.uid, amountMinor, entryId, reference),
    env.DB.prepare("INSERT INTO service_transactions (user_id,reference,service,provider_id,provider_name,quantity,unit_price_minor,total_amount_minor,currency,status,created_at,updated_at,debited_at) SELECT ?,?, 'airtime',?,?,1,?,?,'NGN','processing',?,?,? WHERE EXISTS (SELECT 1 FROM wallet_entries WHERE id=? AND reference=?) ON CONFLICT(user_id,reference) DO NOTHING").bind(auth.user.uid, reference, networkId, network.name, amountMinor, amountMinor, now, now, now, entryId, reference),
  ]);
  if (((debit[0] as { meta?: { changes?: number } }).meta?.changes || 0) !== 1) return json({ error: { code: 'INSUFFICIENT_WALLET_BALANCE', message: 'Your wallet balance is insufficient or this order was already claimed.' } }, 402);

  let supplier: unknown;
  try {
    supplier = await topupmateRequest(env, '/airtime/', 'POST', { network: network.id, amount, phone, airtime_type: airtimeType, ref: reference });
  } catch {
    await env.DB.prepare("UPDATE service_transactions SET status='pending',failure_code='SUPPLIER_OUTCOME_UNCERTAIN',updated_at=? WHERE user_id=? AND reference=? AND status='processing'").bind(Date.now(), auth.user.uid, reference).run();
    return json({ reference, status: 'pending', network: { id: networkId, name: network.name }, amount, message: 'Your airtime request is awaiting supplier confirmation. Check its status before submitting again.' }, 202);
  }
  const providerStatus = getSupplierTransactionStatus(supplier);
  if (providerStatus === 'failed') {
    const refundRequest = new Request(request.url, { method: 'POST', headers: request.headers, body: JSON.stringify({ reference, failureCode: 'TOPUPMATE_PURCHASE_FAILED' }) });
    await refundD1Service(refundRequest, env);
    return json({ error: { code: 'TOPUPMATE_PURCHASE_FAILED', message: 'The airtime request failed. Your wallet was refunded.' } }, 502);
  }
  const status = providerStatus === 'successful' ? 'successful' : 'pending';
  await env.DB.prepare('UPDATE service_transactions SET status=?,provider_status=?,updated_at=? WHERE user_id=? AND reference=?').bind(status, providerStatus, Date.now(), auth.user.uid, reference).run();
  return json({ reference, status, network: { id: networkId, name: network.name }, amount, message: status === 'successful' ? 'Airtime delivery was confirmed by the supplier.' : 'Your airtime request is awaiting supplier confirmation.' }, status === 'successful' ? 200 : 202);
}

async function purchaseD1Electricity(request: Request, env: Env) {
  const auth = await requireUser(request, env);
  if (!auth.user) return auth.response!;
  if (!livePurchasesReady(env)) return json({ error: { code: 'ELECTRICITY_PURCHASES_DISABLED', message: 'Electricity purchases are temporarily unavailable. Your wallet has not been charged.' } }, 503);
  const body = await request.json().catch(() => null) as { provider?: unknown; metertype?: unknown; meternumber?: unknown; amount?: unknown; phone?: unknown; ref?: unknown } | null;
  const providerId = typeof body?.provider === 'string' || typeof body?.provider === 'number' ? String(body.provider).trim() : '';
  const meterType = typeof body?.metertype === 'string' ? body.metertype.trim().toLowerCase() : '';
  const meterNumber = typeof body?.meternumber === 'string' ? body.meternumber.trim() : '';
  const phone = typeof body?.phone === 'string' ? body.phone.replace(/[\s-]/g, '') : '';
  const amount = typeof body?.amount === 'number' ? body.amount : typeof body?.amount === 'string' ? Number(body.amount) : NaN;
  const reference = typeof body?.ref === 'string' ? body.ref.trim() : '';
  if (!providerId || !['prepaid', 'postpaid'].includes(meterType) || meterNumber.length < 4 || meterNumber.length > 40 || !Number.isFinite(amount) || amount <= 0 || !Number.isSafeInteger(Math.round(amount * 100)) || Math.abs(amount * 100 - Math.round(amount * 100)) > 1e-7 || !/^0\d{10}$/.test(phone) || !/^[a-z0-9][a-z0-9_.:-]{5,120}$/i.test(reference)) {
    return json({ error: { code: 'INVALID_REQUEST', message: 'Enter a valid electricity provider, meter, meter type, phone, amount and purchase reference.' } }, 400);
  }
  const amountMinor = Math.round(amount * 100);
  let provider: ReturnType<typeof normalizeUtilityProviders>[number] | undefined;
  try {
    provider = normalizeUtilityProviders(await topupmateRequest(env, '/services/?service=electricity')).find(item => String(item.id) === providerId);
  } catch {
    return json({ error: { code: 'ELECTRICITY_PROVIDERS_UNAVAILABLE', message: 'The live electricity provider list could not be checked.' } }, 502);
  }
  if (!provider?.available) return json({ error: { code: 'PROVIDER_NOT_AVAILABLE', message: 'The selected electricity provider is unavailable.' } }, 409);
  const existing = await env.DB.prepare('SELECT service, provider_id, provider_name, total_amount_minor, status, pins_json FROM service_transactions WHERE user_id=? AND reference=?').bind(auth.user.uid, reference).first<Record<string, unknown>>();
  if (existing) {
    if (existing.service !== 'electricity' || String(existing.provider_id) !== providerId || Number(existing.total_amount_minor) !== amountMinor) return json({ error: { code: 'REFERENCE_CONFLICT', message: 'This order reference belongs to another purchase.' } }, 409);
    if (existing.status === 'failed') return json({ error: { code: 'PREVIOUS_ORDER_FAILED', message: 'This order failed and its wallet debit was refunded. Start a new order.' } }, 409);
    let delivery: unknown = [];
    try { delivery = existing.pins_json ? JSON.parse(String(existing.pins_json)) : []; } catch { delivery = []; }
    return json({ reference, status: existing.status, provider: { id: providerId, name: String(existing.provider_name) }, amount, hasDelivery: existing.status === 'successful' && Array.isArray(delivery) && delivery.length > 0, message: 'This order reference has already been recorded. Check its status before submitting again.' }, existing.status === 'successful' ? 200 : 202);
  }
  try {
    const verification = await topupmateRequest(env, '/electricity/verify/', 'POST', { provider: provider.id, meternumber: meterNumber, metertype: meterType });
    if (getSupplierTransactionStatus(verification) !== 'successful') return json({ error: { code: 'ELECTRICITY_VERIFICATION_FAILED', message: 'TopupMate could not verify the meter. Your wallet has not been charged.' } }, 422);
  } catch {
    return json({ error: { code: 'ELECTRICITY_VERIFICATION_UNAVAILABLE', message: 'TopupMate could not verify the meter. Your wallet has not been charged.' } }, 502);
  }
  const now = Date.now();
  const debitId = `debit:${crypto.randomUUID()}`;
  const debit = await env.DB.batch([
    env.DB.prepare("INSERT INTO wallet_entries (id,user_id,reference,entry_type,amount_minor,created_at) SELECT ?,?,?, 'service_debit',?,? WHERE EXISTS (SELECT 1 FROM wallets WHERE user_id=? AND balance_minor>=?) ON CONFLICT(user_id,reference,entry_type) DO NOTHING").bind(debitId, auth.user.uid, reference, amountMinor, now, auth.user.uid, amountMinor),
    env.DB.prepare('UPDATE wallets SET balance_minor=balance_minor-?,updated_at=? WHERE user_id=? AND balance_minor>=? AND EXISTS (SELECT 1 FROM wallet_entries WHERE id=? AND reference=?)').bind(amountMinor, now, auth.user.uid, amountMinor, debitId, reference),
    env.DB.prepare("INSERT INTO service_transactions (user_id,reference,service,provider_id,provider_name,quantity,unit_price_minor,total_amount_minor,currency,status,created_at,updated_at,debited_at) SELECT ?,?,'electricity',?,?,1,?,?,'NGN','processing',?,?,? WHERE EXISTS (SELECT 1 FROM wallet_entries WHERE id=? AND reference=?) ON CONFLICT(user_id,reference) DO NOTHING").bind(auth.user.uid, reference, providerId, provider.name, amountMinor, amountMinor, now, now, now, debitId, reference),
  ]);
  if (((debit[0] as { meta?: { changes?: number } }).meta?.changes || 0) !== 1) return json({ error: { code: 'INSUFFICIENT_WALLET_BALANCE', message: 'Your wallet balance is insufficient or this request was already claimed.' } }, 402);
  let supplier: unknown;
  try {
    supplier = await topupmateRequest(env, '/electricity/', 'POST', { provider: provider.id, metertype: meterType, meternumber: meterNumber, amount, phone, ref: reference });
  } catch {
    await env.DB.prepare("UPDATE service_transactions SET status='pending',failure_code='SUPPLIER_OUTCOME_UNCERTAIN',updated_at=? WHERE user_id=? AND reference=? AND status='processing'").bind(Date.now(), auth.user.uid, reference).run();
    return json({ reference, status: 'pending', provider: { id: providerId, name: provider.name }, amount, hasDelivery: false, message: 'Your electricity order is awaiting supplier confirmation. Check its status before submitting again.' }, 202);
  }
  const providerStatus = getSupplierTransactionStatus(supplier);
  if (providerStatus === 'failed') {
    const refundRequest = new Request(request.url, { method: 'POST', headers: request.headers, body: JSON.stringify({ reference, failureCode: 'TOPUPMATE_PURCHASE_FAILED' }) });
    await refundD1Service(refundRequest, env);
    return json({ error: { code: 'TOPUPMATE_PURCHASE_FAILED', message: 'The electricity payment failed. Your wallet was refunded.' } }, 502);
  }
  const status = providerStatus === 'successful' ? 'successful' : 'pending';
  const delivery = collectPins(supplier);
  await env.DB.prepare('UPDATE service_transactions SET status=?,provider_status=?,pins_json=?,updated_at=? WHERE user_id=? AND reference=?').bind(status, providerStatus, JSON.stringify(delivery), Date.now(), auth.user.uid, reference).run();
  return json({ reference, status, provider: { id: providerId, name: provider.name }, amount, hasDelivery: status === 'successful' && delivery.length > 0, message: status === 'successful' ? delivery.length ? 'The electricity payment was confirmed and the token is ready to download.' : 'The electricity payment was confirmed. The token is not available from the supplier response yet.' : 'Your electricity order is awaiting supplier confirmation.' }, status === 'successful' ? 200 : 202);
}

async function topupmateRequest(env: Env, path: string, method: 'GET' | 'POST' = 'GET', body?: unknown) {
  if (!env.TOPUPMATE_API_BASE_URL || !env.TOPUPMATE_API_TOKEN) throw new Error('TopupMate is not configured.');
  const base = env.TOPUPMATE_API_BASE_URL.replace(/\/+$/, '');
  const controller = new AbortController();
  const timeout = Math.max(1000, Math.min(30000, Number(env.TOPUPMATE_REQUEST_TIMEOUT_MS) || 15000));
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(`${base}/${path.replace(/^\/+/, '')}`, {
      method,
      headers: { Authorization: `Token ${env.TOPUPMATE_API_TOKEN}`, Accept: 'application/json', ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: controller.signal,
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) throw new Error('TopupMate request failed.');
    return payload;
  } finally {
    clearTimeout(timer);
  }
}

async function verifySupplier(request: Request, env: Env, kind: 'electricity' | 'cable') {
  const auth = await requireUser(request, env);
  if (!auth.user) return auth.response!;
  const body = await request.json().catch(() => null) as { payload?: unknown } | null;
  if (!body?.payload || typeof body.payload !== 'object' || Array.isArray(body.payload)) {
    return json({ error: { code: 'INVALID_REQUEST', message: 'Supply the provider verification payload as a JSON object.' } }, 400);
  }
  try {
    const result = await topupmateRequest(env, kind === 'electricity' ? '/electricity/verify/' : '/cable/verify/', 'POST', body.payload);
    if (kind === 'electricity') {
      const status = getSupplierTransactionStatus(result);
      if (status !== 'successful') return json({ error: { code: 'ELECTRICITY_VERIFICATION_FAILED', message: 'TopupMate could not verify the electricity meter.' } }, 502);
      return json({ supplier: result, status });
    }
    return json({ supplier: result });
  } catch {
    return json({ error: { code: 'TOPUPMATE_VERIFICATION_UNAVAILABLE', message: 'TopupMate could not verify these details right now.' } }, 502);
  }
}

async function catalog(_request: Request, env: Env, service: 'data' | 'network' | 'electricity' | 'exampin') {
  try {
    const result = await topupmateRequest(env, `/services/?service=${service}`);
    const key = service === 'data' ? 'plans' : service === 'network' ? 'networks' : service === 'electricity' ? 'providers' : 'products';
    const normalized = service === 'data' ? normalizeDataPlans(result)
      : service === 'network' ? normalizeNetworks(result)
        : service === 'electricity' ? normalizeUtilityProviders(result)
          : normalizeExamProducts(result);
    return json({ [key]: normalized, fetchedAt: new Date().toISOString(), provider: 'topupmate' });
  } catch {
    return json({ error: { code: 'TOPUPMATE_CATALOGUE_UNAVAILABLE', message: 'The service catalogue is temporarily unavailable.' } }, 502);
  }
}

async function submitSupportComplaint(request: Request, env: Env) {
  const origin = request.headers.get('Origin');
  if (origin && origin !== new URL(request.url).origin) {
    return json({ error: { code: 'INVALID_ORIGIN', message: 'The complaint could not be submitted.' } }, 403);
  }

  const contentLength = Number(request.headers.get('Content-Length') || 0);
  if (contentLength > 10_000) {
    return json({ error: { code: 'COMPLAINT_TOO_LARGE', message: 'Keep the complaint under 5,000 characters.' } }, 413);
  }

  const body = await request.json().catch(() => null) as {
    email?: unknown;
    reference?: unknown;
    message?: unknown;
    website?: unknown;
  } | null;
  if (!body) return json({ error: { code: 'INVALID_COMPLAINT', message: 'Enter your email and complaint details.' } }, 400);

  // Quietly accept bot submissions without sending mail.
  if (typeof body.website === 'string' && body.website.trim()) return json({ ok: true });

  const email = typeof body.email === 'string' ? body.email.trim() : '';
  const reference = typeof body.reference === 'string' ? body.reference.trim() : '';
  const message = typeof body.message === 'string' ? body.message.trim() : '';
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return json({ error: { code: 'INVALID_EMAIL', message: 'Enter a valid email address.' } }, 400);
  }
  if (reference.length > 160 || /[\r\n]/.test(reference)) {
    return json({ error: { code: 'INVALID_REFERENCE', message: 'The transaction reference is too long.' } }, 400);
  }
  if (message.length < 10 || message.length > 5_000) {
    return json({ error: { code: 'INVALID_COMPLAINT', message: 'Complaint details must be between 10 and 5,000 characters.' } }, 400);
  }
  if (!env.SUPPORT_EMAIL || !env.SUPPORT_FROM_EMAIL) {
    return json({ error: { code: 'SUPPORT_EMAIL_NOT_CONFIGURED', message: 'Support email is temporarily unavailable. Please try again later.' } }, 503);
  }

  try {
    const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(ip));
    const ipHash = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
    const now = Date.now();
    const windowStart = Math.floor(now / 600_000) * 600_000;
    const rate = await env.DB.prepare(
      'INSERT INTO support_complaint_rate_limits (ip_hash, window_start, request_count, updated_at) VALUES (?, ?, 1, ?) ON CONFLICT(ip_hash) DO UPDATE SET request_count = CASE WHEN support_complaint_rate_limits.window_start < excluded.window_start THEN 1 ELSE support_complaint_rate_limits.request_count + 1 END, window_start = excluded.window_start, updated_at = excluded.updated_at RETURNING request_count'
    ).bind(ipHash, windowStart, now).first<{ request_count: number }>();
    if (Number(rate?.request_count || 0) > 3) {
      return json({ error: { code: 'SUPPORT_RATE_LIMITED', message: 'Too many complaints were sent from this connection. Please try again in a few minutes.' } }, 429);
    }
  } catch {
    return json({ error: { code: 'SUPPORT_UNAVAILABLE', message: 'Support email is temporarily unavailable. Please try again later.' } }, 503);
  }

  const subject = 'SamEduHub support complaint' + (reference ? ' - ' + reference : '');
  const text = [
    'Customer email: ' + email,
    'Transaction reference: ' + (reference || 'Not provided'),
    '',
    'Complaint:',
    message,
  ].join('\n');

  try {
    await env.SUPPORT_MAILER.send({
      from: env.SUPPORT_FROM_EMAIL,
      to: env.SUPPORT_EMAIL,
      replyTo: email,
      subject,
      text,
    });
    return json({ ok: true });
  } catch (error) {
    const code = typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : 'unknown';
    console.error('Cloudflare Email Service rejected a support complaint:', code);
    return json({ error: { code: 'SUPPORT_EMAIL_FAILED', message: 'We could not send your complaint. Please try again later.' } }, 502);
  }
}

async function cloudflareHealth(env: Env) {
  const purchaseReady = livePurchasesReady(env);
  const fundingReady = env.CLOUDFLARE_FUNDING_ENABLED === 'true' && paystackReady(env);
  try {
    await env.DB.prepare('SELECT 1').first();
    return json({ ok: true, service: 'SamEduHub Cloudflare API', supplier: {
      provider: 'topupmate', configured: Boolean(env.TOPUPMATE_API_TOKEN && env.TOPUPMATE_API_BASE_URL),
      purchaseEnabled: purchaseReady, paymentProvider: 'paystack', paymentMode: env.PAYSTACK_MODE === 'test' || env.PAYSTACK_MODE === 'live' ? env.PAYSTACK_MODE : 'unconfigured', supplierMode: env.TOPUPMATE_MODE === 'sandbox' || env.TOPUPMATE_MODE === 'live' ? env.TOPUPMATE_MODE : 'unconfigured', customerWalletConfigured: env.CLOUDFLARE_WALLET_CUTOVER === 'true',
      transactionStoreConfigured: true, serverAuthConfigured: Boolean(env.FIREBASE_PROJECT_ID),
      fundingEnabled: fundingReady,
    } });
  } catch {
    return json({ ok: false, service: 'SamEduHub Cloudflare API', supplier: {
      provider: 'topupmate', configured: Boolean(env.TOPUPMATE_API_TOKEN && env.TOPUPMATE_API_BASE_URL),
      purchaseEnabled: false, paymentProvider: 'paystack', paymentMode: env.PAYSTACK_MODE === 'test' || env.PAYSTACK_MODE === 'live' ? env.PAYSTACK_MODE : 'unconfigured', supplierMode: env.TOPUPMATE_MODE === 'sandbox' || env.TOPUPMATE_MODE === 'live' ? env.TOPUPMATE_MODE : 'unconfigured', customerWalletConfigured: env.CLOUDFLARE_WALLET_CUTOVER === 'true',
      transactionStoreConfigured: false, serverAuthConfigured: Boolean(env.FIREBASE_PROJECT_ID),
      fundingEnabled: fundingReady,
    } }, 503);
  }
}

const worker = {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const walletRoute = url.pathname.startsWith('/api/cloudflare/wallet')
      || url.pathname === '/api/cloudflare/transactions'
      || url.pathname.startsWith('/api/cloudflare/transactions/')
      || url.pathname === '/api/cloudflare/sme/transaction-status'
      || url.pathname.startsWith('/api/cloudflare/paystack/')
      || url.pathname.startsWith('/api/cloudflare/services/');
    const fundingEnabled = env.CLOUDFLARE_FUNDING_ENABLED === 'true';
    const fundingPath = url.pathname === '/api/cloudflare/wallet/funding'
      || /^\/api\/cloudflare\/wallet\/funding\/[^/]+$/.test(url.pathname)
      || url.pathname === '/api/cloudflare/paystack/callback'
      || url.pathname === '/api/cloudflare/paystack/webhook';
    const previewBalanceRead = url.pathname === '/api/cloudflare/wallet' && request.method === 'GET' && fundingEnabled;
    if (walletRoute && env.CLOUDFLARE_WALLET_CUTOVER !== 'true' && !(fundingEnabled && (fundingPath || previewBalanceRead))) {
      return json({ error: { code: 'CLOUDFLARE_WALLET_NOT_READY', message: 'Cloudflare wallet operations are disabled until existing wallet data has been imported and reconciled.' } }, 503);
    }
    if (url.pathname === '/api/health' && request.method === 'GET') {
      try {
        await env.DB.prepare('SELECT 1').first();
        return json({ ok: true, provider: 'cloudflare', database: 'connected' });
      } catch {
        return json({ ok: false, provider: 'cloudflare', database: 'unavailable' }, 503);
      }
    }
    if (url.pathname === '/api/cloudflare/health' && request.method === 'GET') return cloudflareHealth(env);
    if (url.pathname === '/api/cloudflare/support/complaints' && request.method === 'POST') return submitSupportComplaint(request, env);

    if (url.pathname === '/api/cloudflare/readiness' && request.method === 'GET') return authenticatedReadiness(request, env);
    if (url.pathname === '/api/cloudflare/reconciliation' && request.method === 'GET') return accountReconciliation(request, env);
    if (url.pathname === '/api/cloudflare/profile' && request.method === 'POST') return syncFirebaseProfile(request, env);
    if (url.pathname === '/api/cloudflare/admin/overview' && request.method === 'GET') return adminOverview(request, env);
    if (url.pathname === '/api/cloudflare/wallet' && request.method === 'GET') return getD1Wallet(request, env);
    const fundingMatch = url.pathname.match(/^\/api\/cloudflare\/wallet\/funding\/([^/]+)$/);
    if (fundingMatch && request.method === 'GET') return getD1Funding(request, env, decodeURIComponent(fundingMatch[1]));
    if (url.pathname === '/api/cloudflare/transactions' && request.method === 'GET') return listD1Transactions(request, env);
    if (url.pathname === '/api/cloudflare/wallet/funding' && request.method === 'POST') return createD1Funding(request, env);
    const deliveryMatch = url.pathname.match(/^\/api\/cloudflare\/transactions\/([^/]+)\/delivery$/);
    if (deliveryMatch && request.method === 'GET') return getD1TransactionDelivery(request, env, decodeURIComponent(deliveryMatch[1]));
    if (url.pathname === '/api/cloudflare/services/exam/purchase' && request.method === 'POST') return purchaseD1ExamPin(request, env);
    if (url.pathname === '/api/cloudflare/services/airtime/purchase' && request.method === 'POST') return purchaseD1Airtime(request, env);
    if (url.pathname === '/api/cloudflare/services/electricity/purchase' && request.method === 'POST') return purchaseD1Electricity(request, env);
    if (url.pathname === '/api/cloudflare/paystack/callback' && request.method === 'GET') return fundingCallback(request, env);
    if (url.pathname === '/api/cloudflare/paystack/webhook' && request.method === 'POST') return paystackWebhook(request, env);
    if (url.pathname === '/api/cloudflare/services/exam/debit' && request.method === 'POST') return debitD1Service(request, env);
    if (url.pathname === '/api/cloudflare/services/exam/refund' && request.method === 'POST') return refundD1Service(request, env);
    if (url.pathname === '/api/cloudflare/sme/transaction-status' && request.method === 'GET') return getD1TransactionStatus(request, env);
    if (url.pathname === '/api/cloudflare/internal/sme/balance' && request.method === 'GET') return internalSupplierBalance(request, env);
    if (url.pathname === '/api/cloudflare/internal/sme/transaction-status' && request.method === 'GET') return internalSupplierTransactionStatus(request, env);
    if (url.pathname === '/api/cloudflare/sme/dataplans' && request.method === 'GET') return catalog(request, env, 'data');
    if (url.pathname === '/api/cloudflare/sme/networks' && request.method === 'GET') return catalog(request, env, 'network');
    if (url.pathname === '/api/cloudflare/sme/electricity/providers' && request.method === 'GET') return catalog(request, env, 'electricity');
    if (url.pathname === '/api/cloudflare/sme/exampins' && request.method === 'GET') return catalog(request, env, 'exampin');
    if (url.pathname === '/api/cloudflare/sme/electricity/verify' && request.method === 'POST') return verifySupplier(request, env, 'electricity');
    if (url.pathname === '/api/cloudflare/sme/cabletv/verify' && request.method === 'POST') return verifySupplier(request, env, 'cable');

    // Unknown API paths remain closed; only explicitly implemented routes are served.
    if (url.pathname.startsWith('/api/')) {
      return json({ error: { code: 'CLOUDFLARE_MIGRATION_IN_PROGRESS', message: 'This Cloudflare endpoint is not enabled yet.' } }, 503);
    }

    return env.ASSETS.fetch(request);
  },
};

export default worker;
