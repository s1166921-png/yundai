import { buildAiReportView } from '../../src/lib/aiReportView.js';
import { getVisibleIntakeFields } from '../../src/lib/matching/intakeSchema.js';
// This is the sales-facing contract. Admin/debug/audit fields are never spread into it.
export function salesLead(lead, projectCustomerReport) {
  const report = projectCustomerReport(lead);
  const raw = lead.rawInput ?? {};
  const submittedFields = getVisibleIntakeFields(raw).filter(field => raw[field.key] != null && raw[field.key] !== '').map(field => {
    const value = raw[field.key];
    const formatted = field.options.find(option => option.value === value)?.label ?? (typeof value === 'boolean' ? (value ? '是' : '否') : String(value));
    return { label: field.label, value: formatted + (field.unit ? ' ' + field.unit : '') };
  });
  return { id: lead.id, createdAt: lead.createdAt, companyName: lead.companyName, contactName: lead.contactName,
    phone: lead.phone, profile: lead.profile ?? {}, submittedFields, matchReport: report.matchReport, aiReport: report.aiReport, reportView: buildAiReportView(report.aiReport) };
}
