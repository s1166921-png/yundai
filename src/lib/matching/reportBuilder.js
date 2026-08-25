import { getProductById } from "./productCatalog.js";
import { isProgressiveCustomerProfileField } from "./customerProfile.js";
import { MATCH_DISCLAIMER } from "../publicMatchContract.js";

export { MATCH_DISCLAIMER };

const NON_MATCH_REASON = "当前资料暂未满足该产品的部分基础准入要求。";

const DOCUMENT_BY_FIELD = Object.freeze({
  entityRegion: "企业主体登记证明",
  entityType: "企业主体登记证明",
  registeredProvince: "企业注册地证明",
  companyAgeMonths: "企业登记及持续经营证明",
  legalRepresentativeAge: "法人身份证明",
  controllerIndustryExperienceYears: "实控人从业经历说明",
  industry: "主营业务及行业经营说明",
  businessModels: "主营业务及平台经营证明",
  primaryPlatformOrBuyerName: "平台店铺或核心买方合作证明",
  platformSites: "主要经营站点证明",
  platformHistoryMonths: "平台交易历史证明",
  buyerTradingHistoryMonths: "买方交易历史证明",
  storeCount: "平台店铺经营证明",
  singleStoreGmv: "平台经营数据证明",
  amazonAnnualGmv: "Amazon 近 12 个月 GMV 证明",
  allStoreSales: "近 12 个月销售数据证明",
  allStoreRepayments: "近 12 个月回款记录",
  annualRevenue: "近一年财务报表或纳税申报摘要",
  annualB2bTrade: "近一年 B2B 交易流水或合同",
  importExportAmountLast12Months: "近 12 个月进出口数据证明",
  importExportAmountMonths13To24: "13-24 个月进出口数据证明",
  importExportCountLast12Months: "近 12 个月进出口记录",
  importExportRevenueSharePercent: "进出口业务营收占比说明",
  daysSinceLatestImportExport: "最近一次进出口记录",
  selfOperatedImportExport: "自营进出口经营说明",
  hasImportExportLicense: "进出口经营权证明",
  foreignExchangeClassification: "外汇管理分类证明",
  customsCreditClassification: "海关信用分类证明",
  commodityRevenueSharePercent: "主营商品及营收结构说明",
  twoYearSalesDeclinePercent: "近两年销售收入资料",
  assetLiabilityRatioPercent: "近期财务报表及负债资料",
  coreAssetLiabilityRatioPercent: "核心资产负债资料",
  requestedAmount: "本次融资用途及金额说明",
  taxRecordAndInvoiceCustomerTier: "纳税及发票资料",
  refundRatePercent: "近 3 个月退款率数据",
  amazonAccountStatus: "Amazon 店铺状态证明",
  amazonAhrScore: "Amazon AHR 数据",
  fbaInventoryTurnoverCount: "FBA 库存周转数据",
  borrowerMatchesCollectionEntity: "借款主体与收款主体关系证明",
  acceptsAccountControl: "回款账户安排确认",
  hasCompatibleCollectionAccount: "兼容收款账户证明",
  acceptsReceivablesAssignment: "应收账款转让安排确认",
  acceptsNoa: "NOA 及回款账户安排确认",
  accountsReceivableBalance: "应收账款明细",
  buyerCountry: "买方所在地及准入证明",
  buyerPlatformType: "买方平台类型证明",
  buyerCountryEligibility: "买方国家准入核验资料",
  creditBankCount: "现有银行授信情况说明",
  hasCurrentOverdue: "企业还款状态核验资料",
  hasMajorLitigation: "企业信用与司法信息核验资料",
  hasMaterialCreditOrJudicialNegative: "企业及个人信用与司法信息核验资料",
  hasDishonestyRecord: "企业公开信息核验资料",
  settlementAccountOpenedMonths: "结算账户开户证明",
  applicantRole: "申请人身份说明",
  settlementAccountFlowNormal: "结算账户流水",
  companyCreditRating: "企业信用评级资料",
  internalBankRating: "企业信用评级资料",
  creditExposureToNetAssets: "授信敞口及净资产资料",
  hasRiskWarning: "企业风险状态核验资料",
  isOnAmlBlacklist: "企业合规状态核验资料",
  hasAdverseCreditStatus: "企业信用状态核验资料",
  financialStatementsContinuous: "连续财务报表",
  controllerStatusNormal: "实控人状态核验资料",
  participatingStoreOperatingDays: "参与核额店铺经营记录",
  firstOrderMonthsAgo: "Amazon 首笔订单记录",
});

const formatCatalogAmount = (amount, currency) => {
  const unit = currency === "RMB" ? "元" : currency === "USD" ? "美元" : currency;
  const display = amount >= 10000 && amount % 10000 === 0 ? `${amount / 10000}万` : String(amount);
  return `${display}${unit}`;
};

const formatPricing = (pricing) => {
  const rate = pricing?.annualizedRate;
  if (rate?.minimum != null && rate?.maximum != null) return `年化${rate.minimum}-${rate.maximum}`;
  if (rate?.minimum != null) return `年化${rate.minimum}`;
  return pricing?.note ?? null;
};

const formatTerm = (term = {}) => {
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
  if (Number.isFinite(term.maximumMonths)) return `最长${term.maximumMonths}个月${term.revolving ? "，可循环" : ""}`;
  return null;
};

const formatLimit = (limit = {}) => {
  if (Number.isFinite(limit.maximumPerStore)) {
    return `单店最高${formatCatalogAmount(limit.maximumPerStore, limit.currency)}${limit.revolving ? "，可循环" : ""}`;
  }
  if (Number.isFinite(limit.minimum) && Number.isFinite(limit.maximum)) {
    return `${formatCatalogAmount(limit.minimum, limit.currency)}-${formatCatalogAmount(limit.maximum, limit.currency)}${limit.revolving ? "，可循环" : ""}`;
  }
  if (Number.isFinite(limit.maximum)) return `最高${formatCatalogAmount(limit.maximum, limit.currency)}${limit.revolving ? "，可循环" : ""}`;
  return limit.note ?? null;
};

const customerAmount = (estimate) => {
  if (estimate == null || typeof estimate !== "object") return null;
  return {
    kind: estimate.kind,
    currency: estimate.currency,
    min: estimate.min,
    max: estimate.max,
    note: estimate.note,
  };
};

const hasUsableMoney = (value, currency) => (
  value?.currency === currency && Number.isFinite(value.amount) && value.amount >= 0
);

const hasUsableEstimatorInputs = (match, profile) => {
  switch (match.productId) {
    case "pingan-foreign-trade-logistics-loan":
      return hasUsableMoney(profile.annualRevenue, "RMB")
        && hasUsableMoney(profile.taxInvoiceAmount, "RMB")
        && typeof profile.industry === "string";
    case "webank-cross-border-data-loan":
      return hasUsableMoney(profile.collectionsLast12Months, "RMB")
        || hasUsableMoney(profile.allStoreRepayments, "RMB");
    case "linklogis-amazon-sc":
      return Number.isFinite(profile.qualifiedStoreCount) && profile.qualifiedStoreCount > 0;
    default:
      return true;
  }
};

const presentationFor = (profile, match, role) => {
  if (profile.intakeVersion === "progressive-v1") {
    if (match.status === "eligible") {
      return {
        label: role === "primary" ? "优先产品方向" : "备选产品方向",
        showAmount: true,
      };
    }
    return { label: "待补关键信息", showAmount: false };
  }

  const sufficientlyEvidenced = match.status === "eligible" && match.confidence >= 80;
  if (sufficientlyEvidenced) {
    return {
      label: role === "primary" ? "优先匹配" : "备选方向",
      showAmount: true,
    };
  }
  if (match.confidence < 50) return { label: "可能方向", showAmount: false };
  return { label: "待补信息", showAmount: false };
};

const safeWhyMatched = (product, passedRules = []) => {
  const passedRuleIds = new Set(passedRules.map((rule) => rule.id));
  return product.ruleSet
    .filter((rule) => passedRuleIds.has(rule.id) && rule.internalReason == null)
    .map((rule) => rule.message)
    .filter((message, index, messages) => messages.indexOf(message) === index)
    .slice(0, 3);
};

const reportProduct = (profile, match, role) => {
  const product = getProductById(match.productId);
  if (product == null) return null;
  const presentation = presentationFor(profile, match, role);

  return {
    institution: product.institution,
    name: product.name,
    currency: product.currency,
    pricing: formatPricing(product.pricing),
    term: formatTerm(product.term),
    limit: formatLimit(product.limit),
    presentationLabel: presentation.label,
    estimatedAmount: presentation.showAmount
      && (profile.intakeVersion !== "progressive-v1" || hasUsableEstimatorInputs(match, profile))
      ? customerAmount(match.estimatedAmount)
      : null,
    whyMatched: safeWhyMatched(product, match.passedRules),
  };
};

const rankedMatch = (matches, rank) => matches.find((match) => (
  match?.rank === rank && match.status !== "ineligible"
));

const missingDocumentsFor = (profile, matches) => {
  const documents = [];
  for (const match of matches) {
    for (const field of match?.missingFields ?? []) {
      if (profile.intakeVersion === "progressive-v1" && !isProgressiveCustomerProfileField(field)) continue;
      const document = DOCUMENT_BY_FIELD[field] ?? DOCUMENT_BY_FIELD[field.split(".")[0]];
      if (document != null && !documents.includes(document)) documents.push(document);
      if (documents.length === 5) return documents;
    }
  }
  return documents;
};

export function buildCustomerMatchReport(profile = {}, matches = []) {
  const primaryMatch = rankedMatch(matches, 1);
  const alternativeMatches = [2, 3].map((rank) => rankedMatch(matches, rank)).filter(Boolean);
  const primary = primaryMatch == null ? null : reportProduct(profile, primaryMatch, "primary");
  const alternatives = alternativeMatches.map((match) => reportProduct(profile, match, "alternative")).filter(Boolean);
  const recommendedMatches = [primaryMatch, ...alternativeMatches].filter(Boolean);
  const nonMatches = matches
    .filter((match) => match?.status === "ineligible")
    .map((match) => getProductById(match.productId))
    .filter(Boolean)
    .map((product) => ({
      institution: product.institution,
      name: product.name,
      reason: NON_MATCH_REASON,
      ...(profile.intakeVersion === "progressive-v1" ? { presentationLabel: "暂不匹配" } : {}),
    }));

  return {
    primary,
    alternatives,
    nonMatches,
    missingDocuments: missingDocumentsFor(profile, recommendedMatches),
    summary: primary == null
      ? "当前资料中暂无可展示的推荐产品，请补充相关资料后再评估。"
      : primary.presentationLabel === "优先匹配" || primary.presentationLabel === "优先产品方向"
        ? `已为您整理 1 款优先产品及 ${alternatives.length} 款备选产品。`
        : primary.presentationLabel === "可能方向"
          ? "已根据现有资料整理可能方向；补充关键信息后可进一步判断匹配与额度。"
          : "已整理待补关键信息的产品方向；完善资料后可进一步判断匹配与额度。",
    disclaimer: MATCH_DISCLAIMER,
  };
}
