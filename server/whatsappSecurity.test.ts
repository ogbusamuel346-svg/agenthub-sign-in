import test from 'node:test';
import assert from 'node:assert/strict';
import { createMetaWebhookSignature, verifyMetaWebhookSignature } from '../shared/whatsappSecurity';

test('Meta webhook signatures accept the exact raw payload only', async () => {
  const body = JSON.stringify({ object: 'whatsapp_business_account', entry: [{ id: 'test' }] });
  const signature = await createMetaWebhookSignature(body, 'test-app-secret');
  assert.equal(await verifyMetaWebhookSignature(body, signature, 'test-app-secret'), true);
  assert.equal(await verifyMetaWebhookSignature(`${body} `, signature, 'test-app-secret'), false);
  assert.equal(await verifyMetaWebhookSignature(body, signature, 'wrong-secret'), false);
});

test('Meta webhook signatures reject missing or malformed headers', async () => {
  assert.equal(await verifyMetaWebhookSignature('{}', null, 'test-app-secret'), false);
  assert.equal(await verifyMetaWebhookSignature('{}', 'sha256=bad', 'test-app-secret'), false);
});
