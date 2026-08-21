const PRODUCT_ESTIMATOR_KEYS = Object.freeze({
  "cmb-guangdong-business-loan": "cmb",
  "pingan-orange-tax-loan": "pingan_orange",
  "pingan-foreign-trade-logistics-loan": "pingan_logistics",
  "webank-cross-border-data-loan": "webank_collections",
  "linklogis-amazon-sc": "linklogis_sc",
  "linklogis-amazon-vc": "linklogis_vc",
  "linklogis-b2b-factoring": "linklogis_b2b",
});

const INDUSTRY_COEFFICIENTS = Object.freeze({
  wholesale_retail: Object.freeze({ value: 0.1, note: "批发零售按营收10%与税票核额综合判断，受500万元上限约束" }),
  "批发零售": Object.freeze({ value: 0.1, note: "批发零售按营收10%与税票核额综合判断，受500万元上限约束" }),
  processing_manufacturing: Object.freeze({ value: 0.16, note: "制造业按营收16%与税票核额综合判断，受500万元上限约束" }),
  "加工制造": Object.freeze({ value: 0.16, note: "制造业按营收16%与税票核额综合判断，受500万元上限约束" }),
});

const estimate = (kind, currency, min, max, formulaKey, note) => ({
  kind,
  currency,
  min,
  max,
  formulaKey,
  note,
});

const manual = (currency, formulaKey, note) => estimate("manual", currency, null, null, formulaKey, note);

const resolveEstimatorKey = (product) => {
  if (typeof product === "string") return product;
  if (typeof product?.amountEstimator === "string") return product.amountEstimator;
  return PRODUCT_ESTIMATOR_KEYS[product?.id];
};

const moneyAmount = (profile, field, currency) => {
  const value = profile?.[field];
  return value?.currency === currency && Number.isFinite(value.amount) && value.amount >= 0
    ? value.amount
    : null;
};

const nonNegativeNumber = (profile, field) => {
  const value = profile?.[field];
  return Number.isFinite(value) && value >= 0 ? value : null;
};

const pinganLogistics = (profile) => {
  const industry = INDUSTRY_COEFFICIENTS[profile?.industry];
  const annualRevenue = moneyAmount(profile, "annualRevenue", "RMB");
  const taxInvoiceAmount = moneyAmount(profile, "taxInvoiceAmount", "RMB");

  if (!industry || annualRevenue == null || taxInvoiceAmount == null) {
    return manual("RMB", "pingan_logistics_v1", "需补充人民币年营收、税票核额和所属行业后测算额度。");
  }

  const amount = Math.min(5000000, Math.max(annualRevenue * industry.value, taxInvoiceAmount));
  return estimate("exact", "RMB", amount, amount, "pingan_logistics_v1", industry.note);
};

const webankCollections = (profile) => {
  const collections = moneyAmount(profile, "collectionsLast12Months", "RMB")
    ?? moneyAmount(profile, "allStoreRepayments", "RMB");

  if (collections == null) {
    return manual("RMB", "webank_collections_v1", "需补充近12个月人民币回款后测算额度。");
  }

  const monthlyCollections = collections / 12;
  return estimate(
    "range",
    "RMB",
    Math.min(20000000, monthlyCollections),
    Math.min(20000000, monthlyCollections * 3.5),
    "webank_collections_v1",
    "按近12个月月均回款的1至3.5倍测算，最终倍数由机构综合评级确定",
  );
};

const linklogisSc = (profile) => {
  const qualifiedStoreCount = nonNegativeNumber(profile, "qualifiedStoreCount");

  if (qualifiedStoreCount == null) {
    return manual("USD", "linklogis_sc_v1", "需补充符合条件的店铺数量，最终额度以机构评估为准。");
  }

  return estimate(
    "range",
    "USD",
    0,
    3000000 * qualifiedStoreCount,
    "linklogis_sc_v1",
    "单店最高300万美元，最终额度以机构评估为准。",
  );
};

export function estimateAmount(product, profile = {}) {
  switch (resolveEstimatorKey(product)) {
    case "cmb":
      return manual("RMB", "cmb_manual_v1", "资料未提供基础系数和附加系数具体取值，需客户经理补充系数。");
    case "pingan_orange":
      return estimate("range", "RMB", 50001, 3000000, "pingan_orange_v1", "资料未提供税金到额度的精确核额公式。");
    case "pingan_logistics":
      return pinganLogistics(profile);
    case "webank_collections":
      return webankCollections(profile);
    case "linklogis_sc":
      return linklogisSc(profile);
    case "linklogis_vc":
      return manual("USD", "linklogis_vc_v1", "按可融资应收账款评估，额度不设固定上限。");
    case "linklogis_b2b":
      return manual("USD", "linklogis_b2b_v1", "按买方应收账款评估，额度不设固定上限。");
    default:
      return manual(product?.currency ?? "RMB", "manual_assessment_v1", "未配置可用的额度测算公式。");
  }
}
