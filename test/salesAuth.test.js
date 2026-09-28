import test from 'node:test';
import assert from 'node:assert/strict';
import { salesFixture } from './salesTestSupport.js';
test('eight-character passwords work across creation, change and reset; seven are rejected', async t => {
  const f = await salesFixture(t);
  const sale = (await (await f.asAdmin('/api/admin/promotions/salespeople', 'POST', { name: '密码边界测试' })).json()).salesperson;
  const route = '/api/admin/sales/accounts';
  const input = { salespersonId: sale.id, username: 'eight.test', password: 'Seven12' };
  assert.equal((await f.asAdmin(route, 'POST', input)).status, 400);
  const created = await f.asAdmin(route, 'POST', { ...input, password: 'Eight123' });
  assert.equal(created.status, 201);
  const account = (await created.json()).account;
  const session = await f.login('eight.test', 'Eight123');
  assert.equal((await f.request('/api/sales/password', 'POST', { currentPassword: 'Eight123', newPassword: 'Seven12' }, session.headers)).status, 400);
  assert.equal((await f.request('/api/sales/password', 'POST', { currentPassword: 'Eight123', newPassword: 'Changed8' }, session.headers)).status, 200);
  await f.login('eight.test', 'Changed8');
  assert.equal((await f.asAdmin(route + '/' + account.id + '/password', 'POST', { password: 'Seven12' })).status, 400);
  assert.equal((await f.asAdmin(route + '/' + account.id + '/password', 'POST', { password: 'Reset123' })).status, 200);
  assert.equal((await f.login('eight.test', 'Reset123')).data.mustChangePassword, false);
});
test('sales authentication enforces cookies, Origin, CSRF, change password, logout and reset', async t => {
  const f = await salesFixture(t), { account, sale } = await f.create('sales.a');
  assert.equal((await f.request('/api/admin/sales/accounts')).status, 401);
  assert.equal((await f.request('/api/sales/login', 'POST', { username: 'sales.a', password: 'wrong' })).status, 401);
  assert.equal((await f.request('/api/sales/login', 'POST', {}, { Origin: '' })).status, 403);
  assert.equal((await f.request('/api/sales/login', 'POST', {}, { Origin: 'https://evil.example' })).status, 403);
  const raw = await f.request('/api/sales/login', 'POST', { username: 'sales.a', password: 'initial-password-123' });
  for (const pattern of [/HttpOnly/, /SameSite=Strict/, /Secure/, /Path=\/api\/sales/]) assert.match(raw.headers.get('set-cookie'), pattern);
  const session = await f.login('sales.a');
  assert.equal((await f.request('/api/sales/password', 'POST', {}, { Cookie: session.cookie })).status, 403);
  assert.equal((await f.request('/api/sales/password', 'POST', { currentPassword: 'initial-password-123', newPassword: 'replacement-password-456' }, session.headers)).status, 200);
  assert.equal((await f.request('/api/sales/session', 'GET', undefined, session.headers)).status, 401);
  const next = await f.login('sales.a', 'replacement-password-456');
  assert.equal(next.data.mustChangePassword, false);
  await f.asAdmin('/api/admin/promotions/salespeople/' + sale.id, 'PATCH', { active: false });
  assert.equal((await f.request('/api/sales/session', 'GET', undefined, next.headers)).status, 401);
  await f.asAdmin('/api/admin/sales/accounts/' + account.id, 'PATCH', { active: true });
  const again = await f.login('sales.a', 'replacement-password-456');
  assert.equal((await f.request('/api/sales/logout', 'POST', {}, again.headers)).status, 200);
  assert.equal((await f.request('/api/sales/session', 'GET', undefined, again.headers)).status, 401);
  const beforeReset = await f.login('sales.a', 'replacement-password-456');
  await f.asAdmin('/api/admin/sales/accounts/' + account.id + '/password', 'POST', { password: 'reset-password-987' });
  assert.equal((await f.request('/api/sales/session', 'GET', undefined, beforeReset.headers)).status, 401);
  assert.equal((await f.login('sales.a', 'reset-password-987')).data.mustChangePassword, false);
});

test('new and reset sales accounts can immediately access their workspace without changing passwords', async t => {
  const f = await salesFixture(t), { account } = await f.create('direct.sales');
  const first = await f.login('direct.sales');
  assert.equal(first.data.mustChangePassword, false);
  for (const route of ['/api/sales/leads', '/api/sales/promotion']) {
    assert.equal((await f.request(route, 'GET', undefined, first.headers)).status, 200);
  }
  assert.equal((await f.asAdmin('/api/admin/sales/accounts/' + account.id + '/password', 'POST', { password: 'Reset123' })).status, 200);
  assert.equal((await f.request('/api/sales/leads', 'GET', undefined, first.headers)).status, 401);
  const reset = await f.login('direct.sales', 'Reset123');
  assert.equal(reset.data.mustChangePassword, false);
  assert.equal((await f.request('/api/sales/leads', 'GET', undefined, reset.headers)).status, 200);
});
test('login rate limit and request size bound unauthenticated work', async t => {
  const f = await salesFixture(t);
  assert.equal((await f.request('/api/sales/login', 'POST', { password: 'x'.repeat(5000) })).status, 413);
  for (let i = 0; i < 20; i++) await f.request('/api/sales/login', 'POST', { username: 'missing', password: 'bad' });
  assert.equal((await f.request('/api/sales/login', 'POST', {})).status, 429);
});
