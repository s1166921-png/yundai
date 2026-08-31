import { PRODUCT_CATALOG } from "./productCatalog.js";

const currencyUnit = (currency) => ({ RMB: "元", USD: "美元" }[currency] ?? currency ?? "");

const formatAmountValue = (value) => {
  if (!Number.isFinite(value)) return null;
  if (value >= 10000 && value % 10000 === 0) return `${value / 10000}万`;
  return String(value);
};

const formatLimit = (limit = {}) => {
  const unit = currencyUnit(limit.currency);
  if (Number.isFinite(limit.maximumPerStore)) {
    return `单店最高${formatAmountValue(limit.maximumPerStore)}${unit}${limit.revolving ? "，可循环" : ""}`;
  }
  if (Number.isFinite(limit.minimum) && Number.isFinite(limit.maximum)) {
    return `${formatAmountValue(limit.minimum)}-${formatAmountValue(limit.maximum)}${unit}${limit.revolving ? "，可循环" : ""}`;
  }
  if (Number.isFinite(limit.maximum)) {
    return `最高${formatAmountValue(limit.maximum)}${unit}${limit.revolving ? "，可循环" : ""}`;
  }
  return limit.note ?? "目录暂未提供";
};

const formatTerm = (term = {}) => {
  if (Array.isArray(term.repaymentPlans) && term.repaymentPlans.length > 0) {
    const validity = Number.isFinite(term.creditValidityMonths)
      ? `，额度有效期 ${term.creditValidityMonths / 12} 年`
      : "";
    return `${term.repaymentPlans.join(" 或 ")}${validity}`;
  }
  if (Number.isFinite(term.financingDays)) {
    return term.repayment ? `${term.financingDays}天或${term.repayment}` : `${term.financingDays}天`;
  }
  if (Number.isFinite(term.maximumDays)) {
    return `最长${term.maximumDays}天${term.revolving ? "，可循环" : ""}`;
  }
  if (Number.isFinite(term.creditMaximumMonths)) {
    const draw = Number.isFinite(term.drawMaximumMonths) ? `，单笔最长${term.drawMaximumMonths}个月` : "";
    return `授信最长${term.creditMaximumMonths}个月${draw}${term.revolving ? "，可循环" : ""}`;
  }
  if (Number.isFinite(term.maximumMonths)) {
    return `最长${term.maximumMonths}个月${term.revolving ? "，可循环" : ""}`;
  }
  return "待银行最终核定";
};

const formatPricing = (pricing = {}) => {
  const rate = pricing.annualizedRate;
  if (rate?.minimum != null && rate?.maximum != null) return `年化${rate.minimum}-${rate.maximum}`;
  if (rate?.minimum != null) return `年化${rate.minimum}`;
  return pricing.note ?? "待银行最终核定";
};

const projectProduct = (product) => ({
  id: product.id,
  institution: product.institution,
  name: product.name,
  currency: product.currency,
  limit: formatLimit(product.limit),
  term: formatTerm(product.term),
  pricing: formatPricing(product.pricing),
  scenario: {
    id: product.customerScenario.id,
    label: product.customerScenario.label,
    order: product.customerScenario.order,
  },
  targetProfile: product.customerTargetProfile,
  keyPrerequisite: product.customerPrerequisite,
});

export function getPublicProducts() {
  return PRODUCT_CATALOG.map(projectProduct);
}
