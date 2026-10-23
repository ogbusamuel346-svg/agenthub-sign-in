import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import {
  applyWalletFundingClaim,
  isValidPaystackWebhookSignature,
  parseAmountToMinor,
  requireCustomerEmail,
  validateSuccessfulPaystackTransaction,
  type WalletFundingRecord,
  type WalletState,
} from './walletSecurity';

const record: WalletFundingRecord = {
  uid: 'user-1',
  txRef: 'WALLET-1234567890-ABCDEF1234567890',
  amountMinor: 50000,
  currency: 'NGN',
  customerEmail: 'user@example.com',
  customerName: 'User',
  status: 'checkout_created',
  createdAt: 1,
  updatedAt: 1,
};

test('rejects missing or malformed funding amounts', () => {
  assert.throws(() => parseAmountToMinor(undefined), /amount must be/);
  assert.throws(() => parseAmountToMinor('0'), /greater than zero/);
  assert.throws(() => parseAmountToMinor('100.999'), /at most two/);
});

test('rejects insufficient customer information', () => {
  assert.throws(() => requireCustomerEmail(undefined), /email address/);
  assert.equal(requireCustomerEmail(' User@Example.com '), 'user@example.com');
});

test('validates successful payment reference, currency and amount without requiring payer email equality', () => {
  assert.doesNotThrow(() => validateSuccessfulPaystackTransaction(record, {
    id: '123', reference: record.txRef, status: 'success', amountMinor: 50000, currency: 'NGN', customerEmail: record.customerEmail,
  }));
  assert.throws(() => validateSuccessfulPaystackTransaction(record, {
    id: '123', reference: record.txRef, status: 'success', amountMinor: 49900, currency: 'NGN', customerEmail: record.customerEmail,
  }), /amount/);
  assert.doesNotThrow(() => validateSuccessfulPaystackTransaction(record, {
    id: '123', reference: record.txRef, status: 'success', amountMinor: 50000, currency: 'NGN', customerEmail: 'other@example.com',
  }));
  assert.doesNotThrow(() => validateSuccessfulPaystackTransaction(record, {
    id: '123', reference: record.txRef, status: 'success', amountMinor: 50000, currency: 'NGN',
  }));
  assert.throws(() => validateSuccessfulPaystackTransaction(record, {
    id: '123', reference: record.txRef, status: 'failed', amountMinor: 50000, currency: 'NGN', customerEmail: record.customerEmail,
  }), /successful/);
});

test('verifies Paystack raw-body HMAC-SHA512 signatures', () => {
  const secret = 'sk_test_example_secret';
  const body = Buffer.from('{"event":"charge.success"}');
  const signature = createHmac('sha512', secret).update(body).digest('hex');
  assert.equal(isValidPaystackWebhookSignature(signature, secret, body), true);
  for (const invalid of [undefined, '', 'wrong', `${signature}00`]) {
    assert.equal(isValidPaystackWebhookSignature(invalid, secret, body), false);
  }
  assert.equal(isValidPaystackWebhookSignature(signature, undefined, body), false);
  assert.equal(isValidPaystackWebhookSignature(signature, secret, undefined), false);
  assert.equal(isValidPaystackWebhookSignature(signature, secret, Buffer.from('{}')), false);
});

test('duplicate funding claims do not increase the wallet twice', () => {
  const claim = { txRef: record.txRef, amountMinor: record.amountMinor, providerTransactionId: '123', createdAt: 2 };
  const first = applyWalletFundingClaim(null, claim);
  const second = applyWalletFundingClaim(first.state, claim);
  assert.equal(first.applied, true);
  assert.equal(second.applied, false);
  assert.equal(second.state.balanceMinor, 50000);
});

test('optimistic concurrent credit retries settle once', async () => {
  const claim = { txRef: record.txRef, amountMinor: record.amountMinor, providerTransactionId: '123', createdAt: 2 };
  let state: WalletState | null = null;
  await Promise.all([1, 2].map(async () => {
    const result = applyWalletFundingClaim(state, claim);
    state = result.state;
  }));
  assert.equal((state as unknown as WalletState).balanceMinor, 50000);
});

test('funding preserves exam debit, refund and unrelated wallet fields', () => {
  const current = { balanceMinor: 100, fundingClaims: {}, updatedAt: 1,
    serviceDebits: { exam: { amountMinor: 334000 } }, serviceRefunds: { old: { amountMinor: 500 } }, label: 'existing' };
  const claim = { txRef: 'funding-preserve', amountMinor: 50, providerTransactionId: '456', createdAt: 2 };
  const result = applyWalletFundingClaim(current, claim).state;
  assert.deepEqual(result.serviceDebits, current.serviceDebits);
  assert.deepEqual(result.serviceRefunds, current.serviceRefunds);
  assert.equal(result.label, 'existing');
  assert.equal(result.balanceMinor, 150);
  assert.deepEqual(applyWalletFundingClaim(result, claim).state, result);
});

test('funding rejects corrupt balances, overflow, invalid amounts and conflicting claims', () => {
  const claim = { txRef: 'funding-validate', amountMinor: 50, providerTransactionId: '456', createdAt: 2 };
  assert.throws(() => applyWalletFundingClaim({ balanceMinor: -1, fundingClaims: {}, updatedAt: 1 }, claim), /review/);
  assert.throws(() => applyWalletFundingClaim({ balanceMinor: Number.MAX_SAFE_INTEGER, fundingClaims: {}, updatedAt: 1 }, claim), /limit/);
  assert.throws(() => applyWalletFundingClaim(null, { ...claim, amountMinor: -1 }), /Invalid/);
  const state = applyWalletFundingClaim(null, claim).state;
  assert.throws(() => applyWalletFundingClaim(state, { ...claim, amountMinor: 100 }), /conflicts/);
});
