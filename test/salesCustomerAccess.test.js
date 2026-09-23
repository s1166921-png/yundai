import test from 'node:test';
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { salesFixture, customerInput } from './salesTestSupport.js';
test('sales read only assigned customers, cannot access admin endpoints, lose access on transfer', async t => {
  const f = await salesFixture(t), a = await f.ready('sales.a'), b = await f.ready('sales.b');
  const page = await f.request('/admin/sales'); assert.match(await page.text(), /销售登录/); assert.match(page.headers.get('cache-control'), /no-store/);
  assert.match(await (await f.request('/admin/sales/accounts')).text(), /客户分配/);
  const submit = async ref => (await (await f.request('/api/leads', 'POST', customerInput({ ref }))).json()).lead;
  const leadA = await submit(a.sale.referralCode), leadB = await submit(b.sale.referralCode); await submit(undefined);
  const list = await (await f.request('/api/sales/leads?assignedSalespersonId=' + b.sale.id, 'GET', undefined, a.headers)).json();
  assert.deepEqual(list.leads.map(x => x.id), [leadA.id]);
  assert.equal(list.leads[0].profile.phone, '13800138000');
  assert.ok(list.leads[0].reportView); assert.ok(list.leads[0].submittedFields.some(field => field.label === '联系电话'));
  for (const key of ['rawInput', 'aiAnalysis', 'assignmentHistory', 'advisorReview', 'aiRetry']) assert.equal(list.leads[0][key], undefined);
  assert.equal((await f.request('/api/sales/leads/' + leadB.id, 'GET', undefined, a.headers)).status, 404);
  for (const [route, method] of [['/api/leads','GET'], ['/api/leads/export','GET'], ['/api/leads/' + leadB.id + '/review','PATCH'], ['/api/leads/' + leadB.id + '/ai-retry','POST'], ['/api/admin/promotions/salespeople','GET'], ['/api/admin/sales/accounts','GET']]) {
    assert.equal((await f.request(route, method, method === 'GET' ? undefined : {}, a.headers)).status, 401, route);
  }
  const promo = await (await f.request('/api/sales/promotion?salespersonId=' + b.sale.id, 'GET', undefined, a.headers)).json();
  assert.equal(promo.promotionUrl, 'https://example.org/?ref=' + a.sale.referralCode);
  assert.equal(promo.internalNote, undefined);
  assert.match((await f.request('/api/sales/promotion/qr.png', 'GET', undefined, a.headers)).headers.get('content-type'), /image\/png/);
  const lead = (await (await f.asAdmin('/api/leads')).json()).leads.find(x => x.id === leadA.id);
  await f.asAdmin('/api/admin/leads/' + lead.id + '/assignment', 'PATCH', { assignedSalespersonId: b.sale.id, expectedRevision: lead.revision });
  assert.equal((await f.request('/api/sales/leads/' + lead.id, 'GET', undefined, a.headers)).status, 404);
  assert.equal((await f.request('/api/sales/leads/' + lead.id, 'GET', undefined, b.headers)).status, 200);
  await f.asAdmin('/api/admin/sales/accounts/' + b.account.id, 'PATCH', { active: false });
  assert.equal((await f.request('/api/sales/leads', 'GET', undefined, b.headers)).status, 401);
});
test('initial-password sessions cannot read business data and unavailable storage fails closed', async t => {
  const f = await salesFixture(t); await f.create('sales.a'); const initial = await f.login('sales.a');
  assert.equal((await f.request('/api/sales/leads', 'GET', undefined, initial.headers)).status, 403);
  assert.equal((await f.request('/api/sales/leads')).status, 401);
  const blocker = path.join(f.dir, 'regular-file'); await writeFile(blocker, 'test');
  const broken = await salesFixture(t, { promotionDatabasePath: path.join(blocker, 'broken.sqlite') });
  assert.equal((await broken.request('/api/sales/leads', 'GET', undefined, initial.headers)).status, 503);
  assert.equal((await broken.request('/api/leads', 'POST', customerInput({ ref: 'a'.repeat(32) }))).status, 201);
  const lead = (await (await broken.asAdmin('/api/leads')).json()).leads[0];
  assert.equal(lead.attributionStatus, 'unavailable'); assert.equal(lead.assignedSalespersonId, null);
});
