import { execFileSync } from 'node:child_process';
import { Buffer } from 'node:buffer';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

type Row = Record<string, unknown>;
type ExportData = {
  wallets?: Record<string, unknown>;
  walletFundingTransactions?: Record<string, unknown>;
  walletLedger?: Record<string, Record<string, unknown>>;
  flutterwaveWebhookEvents?: Record<string, unknown>;
  serviceTransactions?: Record<string, Record<string, unknown>>;
};

function isObject(value: unknown): value is Row {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
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

function sql(value: unknown): string {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'number' && Number.isSafeInteger(value)) return String(value);
  if (typeof value === 'boolean') return value ? '1' : '0';
  return `'${String(value).replace(/'/g, "''")}'`;
}

function safeTime(value: unknown, fallback: number) {
  return Number.isSafeInteger(value) && Number(value) >= 0 ? Number(value) : fallback;
}

async function main() {
  const args = process.argv.slice(2).filter(arg => arg !== '--apply' && arg !== '--confirm-import');
  const apply = process.argv.includes('--apply');
  const confirmed = process.argv.includes('--confirm-import');
  const file = args[0];
  if (!file) throw new Error('Usage: npm run cf:migrate:plan -- <firebase-rtdb-export.json> [--apply --confirm-import]');
  if (apply && !confirmed) throw new Error('Remote import requires both --apply and --confirm-import.');

  const data = JSON.parse(await readFile(file, 'utf8')) as ExportData;
  const errors: string[] = [];
  const users = new Set<string>();
  const wallets = new Map<string, { balance: number; updatedAt: number }>();
  const embeddedWalletEntries = { debits: { count: 0, amountMinor: 0 }, refunds: { count: 0, amountMinor: 0 } };
  const funding: Array<{ key: string; row: Row }> = [];
  const ledger: Array<{ uid: string; key: string; row: Row }> = [];
  const services: Array<{ uid: string; key: string; row: Row }> = [];
  const webhookEvents: Array<{ key: string; row: Row }> = [];
  const now = Date.now();

  for (const [uid, raw] of Object.entries(data.wallets || {})) {
    if (!isObject(raw) || !Number.isSafeInteger(raw.balanceMinor) || Number(raw.balanceMinor) < 0) { errors.push('invalid wallet record'); continue; }
    users.add(uid);
    wallets.set(uid, { balance: Number(raw.balanceMinor), updatedAt: safeTime(raw.updatedAt, now) });
    for (const [sourceKey, targetKey] of [['serviceDebits', 'debits'], ['serviceRefunds', 'refunds']] as const) {
      const entries = isObject(raw[sourceKey]) ? raw[sourceKey] as Row : {};
      for (const entry of Object.values(entries)) if (isObject(entry) && Number.isSafeInteger(entry.amountMinor) && Number(entry.amountMinor) > 0) {
        embeddedWalletEntries[targetKey].count++;
        embeddedWalletEntries[targetKey].amountMinor += Number(entry.amountMinor);
      }
    }
  }

  for (const [key, raw] of Object.entries(data.walletFundingTransactions || {})) {
    if (!isObject(raw) || typeof raw.uid !== 'string' || !Number.isSafeInteger(raw.amountMinor) || Number(raw.amountMinor) <= 0 || raw.currency !== 'NGN' || !['pending', 'checkout_created', 'processing', 'successful', 'failed'].includes(String(raw.status)) || typeof raw.customerEmail !== 'string' || typeof raw.customerName !== 'string' || !Number.isSafeInteger(raw.createdAt) || !Number.isSafeInteger(raw.updatedAt) || raw.txRef !== key) {
      errors.push('invalid funding record'); continue;
    }
    users.add(raw.uid);
    funding.push({ key, row: raw });
  }

  for (const [uid, rows] of Object.entries(data.walletLedger || {})) {
    if (!isObject(rows)) { errors.push('invalid wallet ledger'); continue; }
    for (const [key, raw] of Object.entries(rows)) {
      if (!isObject(raw) || raw.uid !== uid || raw.txRef !== key || !Number.isSafeInteger(raw.amountMinor) || Number(raw.amountMinor) <= 0 || raw.currency !== 'NGN' || typeof raw.providerTransactionId !== 'string' || !Number.isSafeInteger(raw.createdAt)) {
        errors.push('invalid wallet ledger entry'); continue;
      }
      users.add(uid);
      ledger.push({ uid, key, row: raw });
    }
  }

  for (const [uidKey, rows] of Object.entries(data.serviceTransactions || {})) {
    const uid = decodeDatabaseKey(uidKey);
    if (!uid || !isObject(rows)) { errors.push('invalid service transaction group'); continue; }
    users.add(uid);
    for (const [key, raw] of Object.entries(rows)) {
      const reference = decodeDatabaseKey(key);
      if (!reference || !isObject(raw) || raw.uid !== uid || raw.reference !== reference || typeof raw.service !== 'string' || typeof raw.providerId !== 'string' || typeof raw.providerName !== 'string' || !Number.isSafeInteger(raw.quantity) || Number(raw.quantity) <= 0 || !Number.isSafeInteger(raw.unitPriceMinor) || Number(raw.unitPriceMinor) <= 0 || !Number.isSafeInteger(raw.totalAmountMinor) || Number(raw.totalAmountMinor) <= 0 || Number(raw.quantity) * Number(raw.unitPriceMinor) !== Number(raw.totalAmountMinor) || raw.currency !== 'NGN' || !['processing', 'pending', 'successful', 'failed'].includes(String(raw.status)) || !Number.isSafeInteger(raw.createdAt) || !Number.isSafeInteger(raw.updatedAt)) {
        errors.push('invalid service transaction'); continue;
      }
      services.push({ uid, key: reference, row: raw });
    }
  }

  for (const [key, raw] of Object.entries(data.flutterwaveWebhookEvents || {})) {
    if (!isObject(raw) || typeof raw.event !== 'string' || typeof raw.transactionId !== 'string' || typeof raw.txRef !== 'string' || typeof raw.status !== 'string') {
      errors.push('invalid webhook event'); continue;
    }
    webhookEvents.push({ key, row: raw });
  }

  const summary = {
    mode: apply ? 'remote D1 import requested' : 'dry run',
    usersReferenced: users.size,
    walletRecords: wallets.size,
    fundingRecords: funding.length,
    walletLedgerEntries: ledger.length,
    serviceTransactions: services.length,
    webhookEvents: webhookEvents.length,
    totalWalletBalanceMinor: [...wallets.values()].reduce((sum, wallet) => sum + wallet.balance, 0),
    embeddedWalletEntries,
    fundingByStatus: Object.fromEntries([...new Set(funding.map(item => String(item.row.status)))].sort().map(status => [status, { count: funding.filter(item => item.row.status === status).length, amountMinor: funding.filter(item => item.row.status === status).reduce((sum, item) => sum + Number(item.row.amountMinor), 0) }])),
    servicesByStatus: Object.fromEntries([...new Set(services.map(item => String(item.row.status)))].sort().map(status => [status, { count: services.filter(item => item.row.status === status).length, totalAmountMinor: services.filter(item => item.row.status === status).reduce((sum, item) => sum + Number(item.row.totalAmountMinor), 0) }])),
    serviceAuditMarkers: { debitedAt: services.filter(item => Number.isSafeInteger(item.row.debitedAt)).length, refundedAt: services.filter(item => Number.isSafeInteger(item.row.refundedAt)).length },
    profileEmails: 'not present in RTDB export; placeholder emails are created and replaced on Firebase sign-in',
    validationErrors: errors.length,
  };
  console.log(JSON.stringify(summary, null, 2));
  if (errors.length) throw new Error('The export failed validation; no data was imported.');
  if (!apply) return;

  const wrangler = resolve('node_modules/wrangler/bin/wrangler.js');
  const countsQuery = 'SELECT (SELECT COUNT(*) FROM wallets) AS wallets, (SELECT COUNT(*) FROM wallet_funding_transactions) AS funding, (SELECT COUNT(*) FROM wallet_ledger) AS ledger, (SELECT COUNT(*) FROM wallet_entries) AS entries, (SELECT COUNT(*) FROM service_transactions) AS services, (SELECT COUNT(*) FROM flutterwave_webhook_events) AS webhook_events';
  const countOutput = execFileSync(process.execPath, [wrangler, 'd1', 'execute', 'sameduhub', '--remote', '--command', countsQuery], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  const jsonResult = countOutput.replace(/\x1b\[[0-9;]*m/g, '').match(/(\[\s*\{\s*"results"[\s\S]*\])\s*$/);
  if (!jsonResult) throw new Error('Could not read remote D1 pre-import counts; no data was imported.');
  const counts = JSON.parse(jsonResult[1])?.[0]?.results?.[0] as Record<string, number> | undefined;
  if (!counts || Object.values(counts).some(value => !Number.isSafeInteger(value) || value !== 0)) {
    throw new Error('Remote D1 already contains wallet or transaction rows; import stopped without changes.');
  }

  const statements: string[] = [];
  for (const uid of users) {
    const createdAt = now;
    statements.push(`INSERT INTO users (id,email,display_name,email_verified,identity_provider,created_at,updated_at) VALUES (${sql(uid)},${sql(`${uid}@firebase-import.invalid`)},NULL,0,'firebase',${createdAt},${createdAt}) ON CONFLICT(id) DO NOTHING;`);
  }
  for (const [uid, wallet] of wallets) statements.push(`INSERT INTO wallets (user_id,balance_minor,updated_at) VALUES (${sql(uid)},${wallet.balance},${wallet.updatedAt});`);
  for (const uid of users) if (!wallets.has(uid)) statements.push(`INSERT INTO wallets (user_id,balance_minor,updated_at) VALUES (${sql(uid)},0,${now});`);
  for (const { key, row } of funding) statements.push(`INSERT INTO wallet_funding_transactions (tx_ref,user_id,amount_minor,currency,customer_email,customer_name,status,checkout_url,provider_transaction_id,failure_code,created_at,updated_at,credited_at) VALUES (${sql(key)},${sql(row.uid)},${Number(row.amountMinor)},'NGN',${sql(row.customerEmail)},${sql(row.customerName)},${sql(row.status)},${sql(row.checkoutUrl)},${sql(row.providerTransactionId)},${sql(row.failureCode)},${Number(row.createdAt)},${Number(row.updatedAt)},${sql(row.creditedAt)});`);
  for (const { uid, key, row } of ledger) statements.push(`INSERT INTO wallet_ledger (id,user_id,tx_ref,amount_minor,currency,provider_transaction_id,created_at) VALUES (${sql(`import:${key}`)},${sql(uid)},${sql(key)},${Number(row.amountMinor)},'NGN',${sql(row.providerTransactionId)},${Number(row.createdAt)});`);
  for (const { uid, key, row } of services) statements.push(`INSERT INTO service_transactions (user_id,reference,service,provider_id,provider_name,quantity,unit_price_minor,total_amount_minor,currency,status,provider_status,pins_json,failure_code,created_at,updated_at,debited_at,refunded_at) VALUES (${sql(uid)},${sql(key)},${sql(row.service)},${sql(row.providerId)},${sql(row.providerName)},${Number(row.quantity)},${Number(row.unitPriceMinor)},${Number(row.totalAmountMinor)},'NGN',${sql(row.status)},${sql(row.providerStatus)},${row.pins === undefined ? 'NULL' : sql(JSON.stringify(row.pins))},${sql(row.failureCode)},${Number(row.createdAt)},${Number(row.updatedAt)},${sql(row.debitedAt)},${sql(row.refundedAt)});`);
  for (const { key, row } of webhookEvents) statements.push(`INSERT INTO flutterwave_webhook_events (event_key,event,transaction_id,tx_ref,status,received_at) VALUES (${sql(key)},${sql(row.event)},${sql(row.transactionId)},${sql(row.txRef)},${sql(row.status)},${safeTime(row.receivedAt, now)});`);
  const tempDir = await mkdtemp(join(tmpdir(), 'sameduhub-firebase-import-'));
  const sqlFile = join(tempDir, 'import.sql');
  try {
    await writeFile(sqlFile, statements.join('\n'), { encoding: 'utf8', flag: 'wx' });
    execFileSync(process.execPath, [wrangler, 'd1', 'execute', 'sameduhub', '--remote', '--file', sqlFile], { stdio: ['ignore', 'pipe', 'pipe'] });
    console.log('Remote D1 import completed. SQL temporary file removed.');
  } catch (error) {
    const failure = error as { code?: unknown; status?: unknown; stderr?: unknown; message?: unknown };
    let detail = typeof failure.stderr === 'string' ? failure.stderr : Buffer.isBuffer(failure.stderr) ? failure.stderr.toString('utf8') : typeof failure.message === 'string' ? failure.message : 'unknown CLI error';
    const privateValues: string[] = [];
    const collect = (value: unknown) => {
      if (typeof value === 'string') privateValues.push(value);
      else if (Array.isArray(value)) value.forEach(collect);
      else if (isObject(value)) for (const [key, nested] of Object.entries(value)) { privateValues.push(key); collect(nested); }
    };
    collect(data);
    for (const secret of privateValues.filter(value => value.length > 1).sort((a, b) => b.length - a.length)) detail = detail.split(secret).join('[redacted]');
    detail = detail.split(sqlFile).join('[temporary import file]').slice(-1200);
    const code = typeof failure.code === 'string' || typeof failure.code === 'number' ? String(failure.code) : 'unknown';
    const status = typeof failure.status === 'number' ? String(failure.status) : 'unknown';
    throw new Error(`Remote D1 import failed (CLI ${code}, status ${status}). ${detail || 'Inspect D1 before retrying.'}`);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'Migration planning failed.');
  process.exitCode = 1;
});
