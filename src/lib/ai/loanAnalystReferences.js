const COLLECTIONS_CODES = Object.freeze([
  "risk:collections-unverified",
]);

const ACCOUNT_CONTROL_PRODUCT_IDS = new Set([
  "linklogis-amazon-sc",
  "linklogis-amazon-vc",
  "linklogis-b2b-factoring",
]);

const STORE_STATUS_PRODUCT_IDS = new Set([
  "linklogis-amazon-sc",
  "linklogis-amazon-vc",
]);

const LOAN_ANALYST_TEXT_BY_CODE = new Map([
  ["risk:collections-unverified", "近 12 个月回款仍需核验。"],
  ["risk:current-debt-unverified", "现有负债情况仍需核验。"],
  ["risk:store-status-unverified", "店铺状态仍需核验。"],
  ["risk:account-control-arrangement", "回款账户控制安排仍需确认。"],
  ["sensitivity:higher-stable-collections-may-increase", "稳定回款提高后，参考区间可能上调。"],
  ["sensitivity:higher-current-debt-may-decrease", "现有负债上升后，参考区间可能下调。"],
  ["sensitivity:complete-evidence-may-narrow-range", "补齐关键资料后，参考区间可能进一步缩窄。"],
  ["sensitivity:term-matches-collection-cycle", "建议期限应与实际回款周期匹配。"],
]);

const TERM_TEXT_BY_CODE = new Map([
  ["webank_4_plus_5", "4+5，额度有效期1年"],
  ["webank_3_plus_6", "3+6，额度有效期1年"],
  ["up_to_36_months", "最长36个月"],
  ["sc_90_days", "90天"],
  ["sc_revolving", "循环使用"],
  ["up_to_120_days", "最长120天"],
]);

const CONFIDENCE_TEXT_BY_CODE = new Map([
  ["low", "较低可信度"],
  ["medium", "中等可信度"],
  ["high", "较高可信度"],
]);

const hasMoney = (value, currency) => (
  value?.currency === currency && Number.isFinite(value.amount) && value.amount >= 0
);

const hasRmbAmount = (profile, field, rawField) => (
  hasMoney(profile?.[field], "RMB")
  || (Number.isFinite(profile?.[rawField]) && profile[rawField] >= 0)
);

const hasCollections = (profile) => (
  hasRmbAmount(profile, "collectionsLast12Months", "collectionsLast12MonthsRmb")
  || hasRmbAmount(profile, "allStoreRepayments", "allStoreRepaymentsRmb")
  || hasRmbAmount(profile, "allStoreRepayments", "platformRepaymentsLast12MonthsRmb")
);

export const buildRiskCodes = ({ profile = {}, productId } = {}) => {
  const codes = [];
  if (!hasCollections(profile)) codes.push(...COLLECTIONS_CODES);
  if (!hasRmbAmount(profile, "currentLoanBalance", "currentLoanBalanceRmb")) {
    codes.push("risk:current-debt-unverified");
  }
  if (STORE_STATUS_PRODUCT_IDS.has(productId) && profile.amazonAccountStatus !== "normal") {
    codes.push("risk:store-status-unverified");
  }
  if (ACCOUNT_CONTROL_PRODUCT_IDS.has(productId) && profile.acceptsAccountControl !== true) {
    codes.push("risk:account-control-arrangement");
  }
  return codes;
};

export const buildSensitivityCodes = ({ profile = {}, productId } = {}) => {
  const codes = [
    "sensitivity:higher-stable-collections-may-increase",
    "sensitivity:higher-current-debt-may-decrease",
  ];
  if (buildRiskCodes({ profile, productId }).length > 0) {
    codes.push("sensitivity:complete-evidence-may-narrow-range");
  }
  if (typeof productId === "string" && productId.length > 0) {
    codes.push("sensitivity:term-matches-collection-cycle");
  }
  return codes;
};

export const resolveLoanAnalystCode = (code) => LOAN_ANALYST_TEXT_BY_CODE.get(code) ?? null;
export const resolveTermCode = (code) => TERM_TEXT_BY_CODE.get(code) ?? null;
export const resolveConfidenceCode = (code) => CONFIDENCE_TEXT_BY_CODE.get(code) ?? null;
