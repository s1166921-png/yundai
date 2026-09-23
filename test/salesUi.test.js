import test from 'node:test';
import assert from 'node:assert/strict';
import { parseHTML } from 'linkedom';
import { buildSalesPage } from '../server/sales/salesPage.mjs';
import { mountSalesClient } from '../server/sales/salesClient.mjs';
import { buildAccountPage } from '../server/sales/accountPage.mjs';
import { mountAccountClient } from '../server/sales/accountClient.mjs';
const ok = data => ({ ok: true, status: 200, json: async () => data });
test('sales login enforces initial password screen and logout clears late customer responses', async () => {
  const { document } = parseHTML(buildSalesPage());
  let resolveList, initial = true;
  const env = { fetch: async route => {
    if (route.endsWith('/login')) return ok({ mustChangePassword: initial, csrfToken: 'token', username: 'sales.a' });
    if (route.includes('/leads')) return new Promise(resolve => { resolveList = resolve; });
    if (route.endsWith('/promotion')) return ok({ promotionUrl: null, totalViews: 0 });
    return ok({ ok: true });
  }, URL: { revokeObjectURL() {} } };
  const client = mountSalesClient(document, env);
  await client.login();
  assert.equal(document.querySelector('#change-panel').hidden, false);
  assert.equal(document.querySelector('#workspace').hidden, true);
  initial = false; const login = client.login();
  await new Promise(resolve => setTimeout(resolve, 0));
  await client.logout();
  resolveList(ok({ leads: [{ id: 'a', companyName: 'PRIVATE COMPANY' }] })); await login;
  assert.equal(document.querySelector('#customers').textContent.includes('PRIVATE COMPANY'), false);
  assert.equal(document.querySelector('#workspace').hidden, true);
});
test('admin failed creation keeps input and switching credentials removes private rows', async () => {
  const { document } = parseHTML(buildAccountPage());
  const env = { btoa: text => Buffer.from(text, 'binary').toString('base64'), fetch: async () => ({ ok: false, status: 409, json: async () => ({ error: '账户名已存在' }) }) };
  const client = mountAccountClient(document, env);
  document.querySelector('#username').value = 'admin'; document.querySelector('#password').value = 'test-password';
  document.querySelector('#account-name').value = 'sales.a';
  await client.createAccount();
  assert.equal(document.querySelector('#account-name').value, 'sales.a');
  assert.match(document.querySelector('#status').textContent, /账户名已存在/);
  document.querySelector('#customer-rows').textContent = 'PRIVATE';
  document.querySelector('#password').dispatchEvent(new document.defaultView.Event('input'));
  assert.equal(document.querySelector('#customer-rows').textContent, '');
});

test('sales detail ignores old customer response and renders names as text', async () => {
  const { document } = parseHTML(buildSalesPage());
  let finishA;
  const env = { fetch: async route => {
    if (route.endsWith('/login')) return ok({ mustChangePassword: false, csrfToken: 'token', username: 'sales.a' });
    if (route.includes('/leads?')) return ok({ leads: [] });
    if (route.endsWith('/promotion')) return ok({ promotionUrl: null, totalViews: 0 });
    if (route.endsWith('/a')) return new Promise(resolve => { finishA = resolve; });
    return ok({ lead: { companyName: '<img src=x onerror=alert(1)>', contactName: 'B', profile: {} } });
  }, URL: { revokeObjectURL() {} } };
  const client = mountSalesClient(document, env); await client.login();
  const first = client.detail('a'); await client.detail('b');
  finishA(ok({ lead: { companyName: 'OLD A', profile: {} } })); await first;
  assert.match(document.querySelector('#detail').textContent, /<img/);
  assert.equal(document.querySelector('#detail img'), null);
  assert.doesNotMatch(document.querySelector('#detail').textContent, /OLD A/);
});
