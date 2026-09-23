import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { once } from 'node:events';
import assert from 'node:assert/strict';
import { createMeiouServer } from '../server/index.mjs';
export async function salesFixture(t, options = {}) {
  const dir = await mkdtemp(path.join(tmpdir(), 'sales-http-'));
  const admin = { username: 'test-admin', password: 'test-admin-password' };
  const server = createMeiouServer({ leadsFilePath: path.join(dir, 'leads.json'), adminCredentials: admin,
    publicSiteUrl: 'https://example.org', allowedOrigins: ['https://example.org'], ...options });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const base = 'http://127.0.0.1:' + server.address().port;
  t.after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); await rm(dir, { recursive: true, force: true }); });
  const request = (route, method = 'GET', body, headers = {}) => fetch(base + route, { method, signal: AbortSignal.timeout(10000),
    headers: { Origin: 'https://example.org', ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });
  const adminHeaders = { Authorization: 'Basic ' + Buffer.from(admin.username + ':' + admin.password).toString('base64') };
  const asAdmin = (route, method, body) => request(route, method, body, adminHeaders);
  const create = async username => {
    const sale = (await (await asAdmin('/api/admin/promotions/salespeople', 'POST', { name: username })).json()).salesperson;
    const response = await asAdmin('/api/admin/sales/accounts', 'POST', { salespersonId: sale.id, username, password: 'initial-password-123' });
    assert.equal(response.status, 201); return { sale, account: (await response.json()).account };
  };
  const login = async (username, password = 'initial-password-123') => {
    const response = await request('/api/sales/login', 'POST', { username, password });
    assert.equal(response.status, 200);
    const data = await response.json(), cookie = response.headers.get('set-cookie').split(';')[0];
    return { cookie, csrf: data.csrfToken, data, headers: { Cookie: cookie, 'X-CSRF-Token': data.csrfToken } };
  };
  const ready = async username => {
    const created = await create(username), first = await login(username);
    assert.equal((await request('/api/sales/password', 'POST', { currentPassword: 'initial-password-123', newPassword: 'replacement-password-456' }, first.headers)).status, 200);
    return { ...created, ...await login(username, 'replacement-password-456') };
  };
  return { dir, base, request, asAdmin, create, login, ready, adminHeaders };
}
