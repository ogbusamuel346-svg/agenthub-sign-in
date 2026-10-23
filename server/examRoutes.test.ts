import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import express, { type RequestHandler } from 'express';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createExamRouter } from './examRoutes';
import type { AuthenticatedRequest } from './authMiddleware';
import { TopupmateApiError } from './smeApi';

const verifiedUser: RequestHandler = (req, _res, next) => {
  (req as AuthenticatedRequest).firebaseUser = { uid: 'verified-customer' } as AuthenticatedRequest['firebaseUser'];
  next();
};
async function fixture(t: TestContext, authenticate?: RequestHandler, fail = false) {
  const calls: { path: string; method: string }[] = [];
  const app = express();
  app.use(express.json());
  app.use('/api/sme', createExamRouter({ authenticate, supplier: async (path, method) => {
    calls.push({ path, method });
    if (fail) throw new Error('private supplier details');
    return [{ id: 7, provider: 'WAEC', price: 3340, status: 'active' }];
  } }));
  app.use((error: TopupmateApiError, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    res.status(error.status || 500).json({ error: { code: error.code, message: error.message } });
  });
  const server = createServer(app);
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())));
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/sme`;
  const post = (path: string) => fetch(`${url}/${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ provider: 7, quantity: 1 }) });
  return { url, post, calls };
}

test('exam catalogue uses the previous TopupMate service endpoint and product IDs', async t => {
  const f = await fixture(t);
  const response = await fetch(`${f.url}/exampins`);
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.deepEqual(f.calls, [{ path: '/services/?service=exampin', method: 'GET' }]);
  assert.equal(payload.provider, 'topupmate');
  assert.equal(payload.products[0].id, 7);
  assert.equal(payload.products[0].price, 3340);
  assert.equal(payload.purchaseEnabled, false);
});
test('exam catalogue errors do not expose raw supplier details', async t => {
  const f = await fixture(t, undefined, true);
  const response = await fetch(`${f.url}/exampins`);
  assert.equal(response.status, 502);
  assert.doesNotMatch(await response.text(), /private/);
});
test('exam purchases still require Firebase authentication', async t => {
  const f = await fixture(t);
  assert.equal((await f.post('exam')).status, 401);
  assert.equal(f.calls.length, 0);
});
test('restoring TopupMate cannot enable charges or duplicate supplier orders', async t => {
  const f = await fixture(t, verifiedUser);
  const responses = await Promise.all(Array.from({ length: 8 }, () => f.post('exam')));
  for (const response of responses) {
    assert.equal(response.status, 503);
    assert.equal((await response.json()).error.code, 'EXAM_PURCHASES_DISABLED');
  }
  assert.equal(f.calls.length, 0);
});
test('removed sandbox quote route is unavailable', async t => {
  const f = await fixture(t, verifiedUser);
  assert.equal((await f.post('exam/quote')).status, 404);
  assert.equal(f.calls.length, 0);
});
