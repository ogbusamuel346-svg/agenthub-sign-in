import { execFileSync } from 'node:child_process';
import { readFile, mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

type Row = Record<string, unknown>;
type FundingRow = {
  uid: string;
  txRef: string;
  amountMinor: number;
  currency: string;
  customerEmail: string;
  customerName: string;
  status: string;
  createdAt: number;
  updatedAt: number;
  checkoutUrl?: string;
};
type VerifiedFunding = FundingRow & { transactionId: string };

const database = 'sameduhub-preview';
const config = 'wrangler.preview.jsonc';
const workerUrl = 'https://sameduhub-api-preview.ogbusamuelagbaji.workers.dev';

function isObject(value: unknown): value is Row {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function sql(value: unknown): string {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'number' && Number.isSafeInteger(value)) return String(value);
  return `'${String(value).replace(/'/g, "''")}'`;
}

function decodeDatabaseKey(value: string) {
  try {
    const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
    const decoded = Buffer.from(normalized, 'base64').toString('utf8');
    return Buffer.from(decoded, 'utf8').toString('base64url') === value ? decoded : null;
  } catch {
    return null;
  }
}

function parseWranglerResults(output: string) {
  const clean = output.replace(/\x1b\[[0-9;]*m/g, '');
  const match = clean.match(/(\[\s*\{\s*"results"[\s\S]*\])\s*$/);
  if (!match) throw new Error('Could not read the preview D1 query result.');
  return JSON.parse(match[1]) as Array<{ results: Row[] }>;
}

function queryD1(command: string) {
  const wrangler = resolve('node_modules/wrangler/bin/wrangler.js');
  const output = execFileSync(process.execPath, [wrangler, 'd1', 'execute', database, '--remote', '--config', config, '--command', command], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  return parseWranglerResults(output);
}

function readSecret(source: string, name: string) {
  for (const line of source.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (match?.[1] === name) return match[2].replace(/^['"]|['"]$/g, '').trim();
  }
  return '';
}

async function verifyByReference(txRef: string, amountMinor: number, secret: string) {
  const url = `https://api.flutterwave.com/v3/transactions/verify_by_reference?tx_ref=${encodeURIComponent(txRef)}`;
  const response = await fetch(url, { headers: { Authorization: `Bearer ${secret}`, Accept: 'application/json' } });
  const payload = await response.json().catch(() => null) as { status?: unknown; data?: { id?: unknown; tx_ref?: unknown; status?: unknown; amount?: unknown; currency?: unknown } | null } | null;
  const data = payload?.data;
  const amount = Number(data?.amount);
  const transactionId = data?.id === undefined ? '' : String(data.id);
  if (!response.ok || payload?.status !== 'success' || !data || !/^\d+$/.test(transactionId)
    || data.tx_ref !== txRef || data.status !== 'successful' || data.currency !== 'NGN'
    || !Number.isFinite(amount) || Math.round(amount * 100) !== amountMinor) {
    throw new Error('A Firebase funding record did not match a successful Flutterwave transaction; import stopped with no D1 changes.');
  }
  return transactionId;
}

async function main() {
  const args = process.argv.slice(2).filter(arg => arg !== '--apply' && arg !== '--confirm-import');
  const apply = process.argv.includes('--apply');
  const confirmed = process.argv.includes('--confirm-import');
  const file = args[0];
  if (!file) throw new Error('Usage: npm run cf:preview:reconcile-firebase -- <firebase-export.json> [--apply --confirm-import]');
  if (apply && !confirmed) throw new Error('Preview D1 writes require both --apply and --confirm-import.');

  const exportData = JSON.parse(await readFile(file, 'utf8')) as {
    wallets?: Record<string, unknown>;
    walletFundingTransactions?: Record<string, unknown>;
    walletLedger?: Record<string, Record<string, unknown>>;
    serviceTransactions?: Record<string, Record<string, unknown>>;
  };
  const walletRows = Object.entries(exportData.wallets || {});
  if (!walletRows.length || walletRows.some(([uid, row]) => !uid || !isObject(row) || row.balanceMinor !== 0)) {
    throw new Error('This recovery only applies when each Firebase wallet has a verified zero balance. No D1 changes were made.');
  }
  const embeddedEntries = walletRows.flatMap(([, row]) => ['serviceDebits', 'serviceRefunds'].flatMap(key => isObject(row) && isObject(row[key]) ? Object.values(row[key] as Row) : []));
  if (embeddedEntries.length || Object.values(exportData.walletLedger || {}).some(rows => Object.keys(rows).length > 0)) {
    throw new Error('The Firebase export has wallet ledger entries that require a full ledger reconciliation. No D1 changes were made.');
  }

  const funding: FundingRow[] = [];
  for (const [txRef, raw] of Object.entries(exportData.walletFundingTransactions || {})) {
    if (!isObject(raw) || typeof raw.uid !== 'string' || !Number.isSafeInteger(raw.amountMinor) || Number(raw.amountMinor) <= 0
      || raw.currency !== 'NGN' || typeof raw.customerEmail !== 'string' || typeof raw.customerName !== 'string'
      || !Number.isSafeInteger(raw.createdAt) || !Number.isSafeInteger(raw.updatedAt) || raw.txRef !== txRef
      || !/^[A-Za-z0-9_-]{12,160}$/.test(txRef)) throw new Error('The Firebase export has an invalid funding record. No D1 changes were made.');
    funding.push({ ...raw, txRef, amountMinor: Number(raw.amountMinor) } as FundingRow);
  }
  const services: Array<{ uid: string; reference: string; row: Row }> = [];
  for (const [encodedUid, rows] of Object.entries(exportData.serviceTransactions || {})) {
    const uid = decodeDatabaseKey(encodedUid);
    if (!uid || !isObject(rows)) throw new Error('The Firebase export has an invalid service transaction group. No D1 changes were made.');
    for (const [encodedReference, raw] of Object.entries(rows)) {
      const reference = decodeDatabaseKey(encodedReference);
      if (!reference || !isObject(raw) || raw.uid !== uid || raw.reference !== reference || typeof raw.service !== 'string'
        || typeof raw.providerId !== 'string' || typeof raw.providerName !== 'string' || raw.currency !== 'NGN'
        || !['processing', 'pending', 'successful', 'failed'].includes(String(raw.status)) || !Number.isSafeInteger(raw.quantity)
        || Number(raw.quantity) <= 0 || !Number.isSafeInteger(raw.unitPriceMinor) || Number(raw.unitPriceMinor) <= 0
        || !Number.isSafeInteger(raw.totalAmountMinor) || Number(raw.quantity) * Number(raw.unitPriceMinor) !== Number(raw.totalAmountMinor)
        || !Number.isSafeInteger(raw.createdAt) || !Number.isSafeInteger(raw.updatedAt)) {
        throw new Error('The Firebase export has an invalid service transaction. No D1 changes were made.');
      }
      services.push({ uid, reference, row: raw });
    }
  }

  const verificationSource = await readFile('.dev.vars', 'utf8');
  const flutterwaveSecret = readSecret(verificationSource, 'FLW_SECRET_KEY');
  if (!flutterwaveSecret) throw new Error('FLW_SECRET_KEY is missing from .dev.vars. No D1 changes were made.');
  const verified: VerifiedFunding[] = [];
  for (const item of funding) verified.push({ ...item, transactionId: await verifyByReference(item.txRef, item.amountMinor, flutterwaveSecret) });

  const results = queryD1('SELECT id FROM users; SELECT user_id,balance_minor FROM wallets; SELECT tx_ref,user_id,amount_minor,status,provider_transaction_id FROM wallet_funding_transactions; SELECT tx_ref,amount_minor FROM wallet_ledger; SELECT user_id,reference FROM service_transactions;');
  const users = results[0]?.results || [];
  const wallets = results[1]?.results || [];
  const fundingRows = results[2]?.results || [];
  const ledgerRows = results[3]?.results || [];
  const serviceRows = results[4]?.results || [];
  const firebaseUids = walletRows.map(([uid]) => uid);
  if (firebaseUids.length !== users.length || firebaseUids.some(uid => !users.some(row => row.id === uid))) {
    throw new Error('Firebase account IDs do not exactly match preview D1 accounts. No D1 changes were made.');
  }
  if (wallets.length !== walletRows.length || firebaseUids.some(uid => !wallets.some(row => row.user_id === uid))) {
    throw new Error('Preview wallet rows do not match Firebase accounts. No D1 changes were made.');
  }
  const walletTotal = wallets.reduce((total, row) => total + Number(row.balance_minor), 0);
  const ledgerTotal = ledgerRows.reduce((total, row) => total + Number(row.amount_minor), 0);
  if (walletTotal !== ledgerTotal) throw new Error('The current preview wallet does not reconcile to its funding ledger. No D1 changes were made.');
  for (const item of verified) {
    const existing = fundingRows.find(row => row.tx_ref === item.txRef);
    if (existing && (existing.user_id !== item.uid || Number(existing.amount_minor) !== item.amountMinor
      || (existing.provider_transaction_id !== null && existing.provider_transaction_id !== item.transactionId)
      || (existing.status === 'successful' && existing.provider_transaction_id !== item.transactionId))) {
      throw new Error('A Firebase funding reference conflicts with preview D1. No D1 changes were made.');
    }
    const existingLedger = ledgerRows.find(row => row.tx_ref === item.txRef);
    if (existingLedger && Number(existingLedger.amount_minor) !== item.amountMinor) throw new Error('A Firebase funding reference conflicts with the preview ledger. No D1 changes were made.');
  }
  for (const service of services) {
    if (serviceRows.some(row => row.user_id === service.uid && row.reference === service.reference)) continue;
    if (!firebaseUids.includes(service.uid)) throw new Error('A service history record has no matching preview account. No D1 changes were made.');
  }

  const alreadyCredited = verified.filter(item => ledgerRows.some(row => row.tx_ref === item.txRef));
  const toCredit = verified.filter(item => !ledgerRows.some(row => row.tx_ref === item.txRef));
  const newServices = services.filter(item => !serviceRows.some(row => row.user_id === item.uid && row.reference === item.reference));
  console.log(JSON.stringify({ mode: apply ? 'apply preview reconciliation' : 'dry run', matchedFirebaseAccounts: firebaseUids.length, currentPreviewWalletMinor: walletTotal, currentPreviewLedgerMinor: ledgerTotal, verifiedSuccessfulFundingCount: verified.length, alreadyReconciledFundingCount: alreadyCredited.length, fundingToCreditCount: toCredit.length, fundingToCreditMinor: toCredit.reduce((sum, row) => sum + row.amountMinor, 0), historicalServiceRowsToImport: newServices.length }, null, 2));
  if (!apply) return;

  const statements: string[] = [];
  for (const item of toCredit) {
    statements.push(`INSERT INTO wallet_funding_transactions (tx_ref,user_id,amount_minor,currency,customer_email,customer_name,status,checkout_url,provider_transaction_id,failure_code,created_at,updated_at,credited_at) VALUES (${sql(item.txRef)},${sql(item.uid)},${item.amountMinor},'NGN',${sql(item.customerEmail)},${sql(item.customerName)},'processing',NULL,NULL,NULL,${Number(item.createdAt)},${Number(item.updatedAt)},NULL) ON CONFLICT(tx_ref) DO NOTHING;`);
  }
  for (const item of newServices) {
    const row = item.row;
    statements.push(`INSERT INTO service_transactions (user_id,reference,service,provider_id,provider_name,quantity,unit_price_minor,total_amount_minor,currency,status,provider_status,pins_json,failure_code,created_at,updated_at,debited_at,refunded_at) VALUES (${sql(item.uid)},${sql(item.reference)},${sql(row.service)},${sql(row.providerId)},${sql(row.providerName)},${Number(row.quantity)},${Number(row.unitPriceMinor)},${Number(row.totalAmountMinor)},'NGN',${sql(row.status)},${sql(row.providerStatus)},${row.pins === undefined ? 'NULL' : sql(JSON.stringify(row.pins))},${sql(row.failureCode)},${Number(row.createdAt)},${Number(row.updatedAt)},${sql(row.debitedAt)},${sql(row.refundedAt)}) ON CONFLICT(user_id,reference) DO NOTHING;`);
  }
  if (statements.length) {
    const tempDir = await mkdtemp(join(tmpdir(), 'sameduhub-preview-reconcile-'));
    const sqlFile = join(tempDir, 'reconcile.sql');
    try {
      await writeFile(sqlFile, statements.join('\n'), { encoding: 'utf8', flag: 'wx' });
      const wrangler = resolve('node_modules/wrangler/bin/wrangler.js');
      execFileSync(process.execPath, [wrangler, 'd1', 'execute', database, '--remote', '--config', config, '--file', sqlFile], { stdio: ['ignore', 'pipe', 'pipe'] });
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  }

  for (const item of toCredit) {
    const url = new URL('/api/cloudflare/flutterwave/callback', workerUrl);
    url.searchParams.set('tx_ref', item.txRef);
    url.searchParams.set('transaction_id', item.transactionId);
    const response = await fetch(url, { redirect: 'manual' });
    if (!response.ok && response.status !== 303) throw new Error('A verified funding reconciliation needs review in preview D1. The import is idempotent and can be safely resumed.');
  }

  const importedReferences = verified.map(item => sql(item.txRef)).join(',');
  const after = queryD1(`SELECT COALESCE(SUM(balance_minor),0) AS total_minor FROM wallets; SELECT COALESCE(SUM(amount_minor),0) AS total_minor FROM wallet_ledger; SELECT COUNT(*) AS count FROM wallet_funding_transactions WHERE tx_ref IN (${importedReferences}) AND status='successful'; SELECT COUNT(*) AS count FROM wallet_ledger WHERE tx_ref IN (${importedReferences});`);
  const newWalletTotal = Number(after[0]?.results?.[0]?.total_minor || 0);
  const newLedgerTotal = Number(after[1]?.results?.[0]?.total_minor || 0);
  if (newWalletTotal !== newLedgerTotal || Number(after[2]?.results?.[0]?.count || 0) !== verified.length
    || Number(after[3]?.results?.[0]?.count || 0) !== verified.length) throw new Error('Preview D1 reconciliation needs manual review.');
  console.log(JSON.stringify({ complete: true, recoveredFundingCount: toCredit.length, recoveredFundingMinor: toCredit.reduce((sum, row) => sum + row.amountMinor, 0), importedHistoricalServiceRows: newServices.length, reconciledPreviewWalletMinor: newWalletTotal, reconciledPreviewLedgerMinor: newLedgerTotal }, null, 2));
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'Preview wallet reconciliation failed.');
  process.exitCode = 1;
});
