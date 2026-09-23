import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { salesFixture, customerInput } from './salesTestSupport.js';
import { readPromotionRef } from '../src/lib/promotionRef.js';
test('referral is server resolved, repeated submissions independent, transfer audited and version guarded', async t => {
  const f = await salesFixture(t), a = await f.create('sales.a'), b = await f.create('sales.b');
  const body = await (await f.request('/api/leads', 'POST', customerInput({ ref: a.sale.referralCode, assignedSalespersonId: b.sale.id }))).json();
  assert.ok(body.lead?.id); assert.equal(body.lead.assignedSalespersonId, undefined);
  let rows = (await (await f.asAdmin('/api/leads')).json()).leads;
  const lead = rows.find(x => x.id === body.lead.id);
  assert.equal(lead.sourceSalespersonId, a.sale.id); assert.equal(lead.assignedSalespersonId, a.sale.id);
  const route = '/api/admin/leads/' + lead.id + '/assignment';
  const results = await Promise.all([a, b].map(target => f.asAdmin(route, 'PATCH', { assignedSalespersonId: target.sale.id === a.sale.id ? null : target.sale.id, expectedRevision: lead.revision })));
  assert.deepEqual(results.map(x => x.status).sort(), [200, 409]);
  const stored = JSON.parse(await readFile(path.join(f.dir, 'leads.json'), 'utf8'))[0];
  assert.equal(stored.sourceSalespersonId, a.sale.id); assert.equal(stored.assignmentHistory.length, 1);
  await f.request('/api/leads', 'POST', customerInput({ ref: b.sale.referralCode }));
  rows = (await (await f.asAdmin('/api/leads')).json()).leads;
  assert.equal(rows.length, 2); assert.equal(rows.find(x => x.id === lead.id).assignedSalespersonId, stored.assignedSalespersonId);
  assert.equal(readPromotionRef('?ref=' + a.sale.referralCode + '&ref=' + b.sale.referralCode), null);
  assert.equal(readPromotionRef('?ref=' + a.sale.referralCode), a.sale.referralCode);
});
test('direct, invalid and disabled sources stay unassigned; legacy rows are preserved', async t => {
  const f = await salesFixture(t), a = await f.create('sales.a');
  await f.asAdmin('/api/admin/promotions/salespeople/' + a.sale.id, 'PATCH', { active: false });
  for (const ref of [undefined, 'invalid', a.sale.referralCode]) {
    const response = await f.request('/api/leads', 'POST', customerInput({ ref })); assert.equal(response.status, 201);
  }
  const rows = (await (await f.asAdmin('/api/leads')).json()).leads;
  assert.ok(rows.every(x => x.assignedSalespersonId === null));
  assert.deepEqual(rows.map(x => x.attributionStatus).sort(), ['direct','inactive','invalid']);
  const file = path.join(f.dir, 'leads.json'); const legacy = JSON.parse(await readFile(file, 'utf8'));
  delete legacy[0].assignedSalespersonId; delete legacy[0].sourceSalespersonId; await writeFile(file, JSON.stringify(legacy));
  assert.equal((await f.asAdmin('/api/leads')).status, 200);
});
test('AI completion preserves a transfer committed while generation was in flight', async t => {
  let release, signal;
  const started = new Promise(resolve => { signal = resolve; });
  const gate = new Promise(resolve => { release = resolve; });
  const f = await salesFixture(t, { aiReportService: { generate: async () => { signal(); await gate; throw new Error('synthetic fallback'); } } });
  const a = await f.create('sales.a'), b = await f.create('sales.b');
  const pending = f.request('/api/leads', 'POST', customerInput({ ref: a.sale.referralCode }));
  await started;
  const lead = (await (await f.asAdmin('/api/leads')).json()).leads[0];
  assert.equal((await f.asAdmin('/api/admin/leads/' + lead.id + '/assignment', 'PATCH', { assignedSalespersonId: b.sale.id, expectedRevision: lead.revision })).status, 200);
  release(); assert.equal((await pending).status, 201);
  const final = (await (await f.asAdmin('/api/leads')).json()).leads[0];
  assert.equal(final.assignedSalespersonId, b.sale.id); assert.equal(final.assignmentHistory.length, 1); assert.equal(final.revision, 3);
});
