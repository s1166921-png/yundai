// This is the sales-facing contract. Admin/debug/audit fields are never spread into it.
export function salesLead(lead, projectCustomerReport) {
  const report = projectCustomerReport(lead);
  return { id: lead.id, createdAt: lead.createdAt, companyName: lead.companyName, contactName: lead.contactName,
    phone: lead.phone, profile: lead.profile ?? {}, matchReport: report.matchReport, aiReport: report.aiReport };
}
