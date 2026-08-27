import { PRODUCT_IDS } from "../matching/productCatalog.js";

export const AI_ANALYSIS_SCHEMA_VERSION = "meiou-analysis-v1";

const PRIMARY_BUSINESS_MODELS = new Set([
  "tax_operations",
  "amazon_sc",
  "amazon_vc",
  "platform_ecommerce",
  "b2b_supermarket",
  "general_import_export",
  "processing_manufacturing",
  "wholesale_retail",
  "other",
]);

const ENTITY_REGIONS = new Set(["mainland", "hong_kong", "united_states", "other_overseas"]);
const FUND_USES = new Set([
  "inventory_procurement",
  "logistics_working_capital",
  "receivables_turnover",
  "platform_operations",
  "tax_business_operations",
  "other",
]);
const PRODUCT_STATUSES = new Set(["eligible", "needs_information", "ineligible"]);
const PRODUCT_ID_SET = new Set(PRODUCT_IDS);

const SAFE_DOCUMENT_NAMES = new Set([
  "企业主体登记证明",
  "企业注册地证明",
  "企业登记及持续经营证明",
  "法人身份证明",
  "实控人从业经历说明",
  "主营业务及行业经营说明",
  "主营业务及平台经营证明",
  "平台店铺或核心买方合作证明",
  "主要经营站点证明",
  "平台交易历史证明",
  "买方交易历史证明",
  "平台店铺经营证明",
  "平台经营数据证明",
  "Amazon 近 12 个月 GMV 证明",
  "近 12 个月销售数据证明",
  "近 12 个月回款记录",
  "近一年财务报表或纳税申报摘要",
  "近一年 B2B 交易流水或合同",
  "近 12 个月进出口数据证明",
  "13-24 个月进出口数据证明",
  "近 12 个月进出口记录",
  "进出口业务营收占比说明",
  "最近一次进出口记录",
  "自营进出口经营说明",
  "进出口经营权证明",
  "外汇管理分类证明",
  "海关信用分类证明",
  "主营商品及营收结构说明",
  "近两年销售收入资料",
  "近期财务报表及负债资料",
  "核心资产负债资料",
  "本次融资用途及金额说明",
  "纳税及发票资料",
  "近 3 个月退款率数据",
  "Amazon 店铺状态证明",
  "Amazon AHR 数据",
  "FBA 库存周转数据",
  "借款主体与收款主体关系证明",
  "回款账户安排确认",
  "兼容收款账户证明",
  "应收账款转让安排确认",
  "NOA 及回款账户安排确认",
  "应收账款明细",
  "买方所在地及准入证明",
  "买方平台类型证明",
  "买方国家准入核验资料",
  "现有银行授信情况说明",
  "企业还款状态核验资料",
  "企业信用与司法信息核验资料",
  "企业及个人信用与司法信息核验资料",
  "企业公开信息核验资料",
  "结算账户开户证明",
  "申请人身份说明",
  "结算账户流水",
  "企业信用评级资料",
  "授信敞口及净资产资料",
  "企业风险状态核验资料",
  "企业合规状态核验资料",
  "企业信用状态核验资料",
  "连续财务报表",
  "实控人状态核验资料",
  "参与核额店铺经营记录",
  "Amazon 首笔订单记录",
]);

const monthBand = (value) => {
  if (!Number.isFinite(value) || value < 0) return null;
  if (value < 6) return "under_6_months";
  if (value < 12) return "6-12_months";
  if (value < 24) return "12-24_months";
  if (value < 60) return "24-60_months";
  return "60_plus_months";
};

const moneyBand = (money) => {
  if (!Number.isFinite(money?.amount) || money.amount < 0 || !["RMB", "USD"].includes(money.currency)) return null;
  const bands = money.currency === "USD" ? [
    [500000, "under_500k_USD"], [1000000, "500k-1m_USD"],
    [3000000, "1m-3m_USD"], [5000000, "3m-5m_USD"],
    [10000000, "5m-10m_USD"], [Infinity, "10m_plus_USD"],
  ] : [
    [1000000, "under_1m_RMB"], [3000000, "1m-3m_RMB"],
    [5000000, "3m-5m_RMB"], [10000000, "5m-10m_RMB"],
    [30000000, "10m-30m_RMB"], [50000000, "30m-50m_RMB"],
    [100000000, "50m-100m_RMB"], [Infinity, "100m_plus_RMB"],
  ];
  return bands.find(([upper]) => money.amount < upper)?.[1] ?? null;
};

const addEnumFact = (facts, key, value, allowedValues) => {
  if (allowedValues.has(value)) facts[key] = value;
};

const addBucketFact = (facts, key, value, bucket) => {
  const mapped = bucket(value);
  if (mapped != null) facts[key] = mapped;
};

const customerSafeMessages = (rules) => {
  const messages = [];
  for (const rule of Array.isArray(rules) ? rules : []) {
    if (rule?.internalReason != null || typeof rule?.message !== "string" || rule.message.length === 0) continue;
    if (!messages.includes(rule.message)) messages.push(rule.message);
    if (messages.length === 3) break;
  }
  return messages;
};

const rankedProducts = (productMatches) => (Array.isArray(productMatches) ? productMatches : [])
  .filter((match) => (
    Number.isFinite(match?.rank)
    && PRODUCT_ID_SET.has(match.productId)
    && PRODUCT_STATUSES.has(match.status)
  ))
  .sort((left, right) => left.rank - right.rank)
  .slice(0, 3)
  .map((match) => ({
    productId: match.productId,
    status: match.status,
    satisfiedConditions: customerSafeMessages(match.passedRules),
    itemsToConfirm: customerSafeMessages(match.unknownRules),
  }));

const preparationDocuments = (matchReport) => {
  const documents = [];
  for (const document of Array.isArray(matchReport?.missingDocuments) ? matchReport.missingDocuments : []) {
    if (SAFE_DOCUMENT_NAMES.has(document) && !documents.includes(document)) documents.push(document);
  }
  return documents;
};

export const buildAiAnalysisInput = ({ profile = {}, productMatches = [], matchReport = {} } = {}) => {
  const facts = {};
  addEnumFact(facts, "entityRegion", profile.entityRegion, ENTITY_REGIONS);
  addBucketFact(facts, "companyAgeBand", profile.companyAgeMonths, monthBand);
  addBucketFact(facts, "platformHistoryBand", profile.platformHistoryMonths, monthBand);
  addBucketFact(facts, "singleStoreGmvBand", profile.singleStoreGmv, moneyBand);
  addBucketFact(facts, "requestedAmountBand", profile.requestedAmount, moneyBand);
  addEnumFact(facts, "fundUse", profile.fundUse, FUND_USES);
  if (profile.acceptsAccountControl === true || profile.acceptsAccountControl === false) {
    facts.acceptsAccountControl = profile.acceptsAccountControl;
  }

  return {
    schemaVersion: AI_ANALYSIS_SCHEMA_VERSION,
    scenario: PRIMARY_BUSINESS_MODELS.has(profile.primaryBusinessModel) ? profile.primaryBusinessModel : null,
    facts,
    products: rankedProducts(productMatches),
    preparationDocuments: preparationDocuments(matchReport),
  };
};
