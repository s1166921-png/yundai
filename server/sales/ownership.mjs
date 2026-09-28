import { PromotionError } from '../promotion/validation.mjs';
import { json, failure, readJson } from './http.mjs';

export async function resolveSubmissionOwnership(ref, getStore) {
  const result = { sourceSalespersonId: null, assignedSalespersonId: null, attributionStatus: 'direct', assignmentHistory: [] };
  if (ref == null || ref === '') return result;
  if (typeof ref !== 'string' || !/^[a-f0-9]{32}$/.test(ref)) return { ...result, attributionStatus: 'invalid' };
  try {
    const sale = (await getStore()).getSalespersonByReferral(ref);
    if (!sale) return { ...result, attributionStatus: 'invalid' };
    if (!sale.active) return { ...result, attributionStatus: 'inactive' };
    return { ...result, sourceSalespersonId: sale.id, assignedSalespersonId: sale.id, attributionStatus: 'attributed' };
  } catch { return { ...result, attributionStatus: 'unavailable' }; }
}
export async function withSalespersonNames(leads, getStore) {
  let names = new Map();
  if (leads.some(lead => lead.sourceSalespersonId || lead.assignedSalespersonId)) {
    try { names = new Map((await getStore()).listSalespeople().map(sale => [sale.id, sale.name])); }
    catch { /* Customer administration remains available when the promotion store fails. */ }
  }
  return leads.map(lead => ({ ...lead,
    sourceSalespersonName: lead.sourceSalespersonId ? names.get(lead.sourceSalespersonId) ?? '历史销售' : '普通入口 / 未知',
    assignedSalespersonName: lead.assignedSalespersonId ? names.get(lead.assignedSalespersonId) ?? '历史销售' : '待分配' }));
}
export function transferLead(lead, { assignedSalespersonId, expectedRevision, actor, now }) {
  const revision = Number.isInteger(lead.revision) && lead.revision >= 0 ? lead.revision : 0;
  if (!Number.isInteger(expectedRevision) || expectedRevision < 0) throw new PromotionError('请提供客户版本号');
  if (revision !== expectedRevision) throw new PromotionError('客户信息已更新，请刷新后重新分配', 409);
  if ((lead.assignedSalespersonId ?? null) === assignedSalespersonId) return lead;
  return { ...lead, assignedSalespersonId, revision: revision + 1,
    assignmentHistory: [...(Array.isArray(lead.assignmentHistory) ? lead.assignmentHistory : []),
      { from: lead.assignedSalespersonId ?? null, to: assignedSalespersonId, actor, at: now().toISOString() }] };
}
export function createOwnershipHandler({ getStore, isAdmin, updateLeads, actor, now }) {
  return async (request, response, url) => {
    if (!url.pathname.startsWith('/api/admin/leads/')) return false;
    try {
      if (!isAdmin(request)) throw new PromotionError('后台口令不正确', 401);
      const match = url.pathname.match(/^\/api\/admin\/leads\/([^/]+)\/assignment$/);
      if (!match || request.method !== 'PATCH') throw new PromotionError('接口或请求方法不支持', 404);
      const input = await readJson(request), targetId = input.assignedSalespersonId;
      if (targetId !== null && (typeof targetId !== 'string' || !/^[a-f0-9-]{36}$/.test(targetId))) throw new PromotionError('请选择负责销售或待分配');
      let updated;
      await updateLeads(async leads => {
        if (targetId !== null && !(await getStore()).getSalesperson(targetId)?.active) throw new PromotionError('目标销售不存在或已停用');
        const index = leads.findIndex(lead => lead.id === match[1]);
        if (index < 0) throw new PromotionError('客户不存在', 404);
        updated = transferLead(leads[index], { assignedSalespersonId: targetId, expectedRevision: input.expectedRevision, actor, now });
        return leads.map((lead, i) => i === index ? updated : lead);
      });
      json(response, 200, { id: updated.id, assignedSalespersonId: updated.assignedSalespersonId ?? null, revision: updated.revision ?? 0 }); return true;
    } catch (error) { failure(response, error); return true; }
  };
}
