import { PRODUCT_CATALOG } from "../matching/productCatalog.js";

const SUMMARY_TEXT_BY_CODE = new Map([
  ["summary:profile-submitted", "已根据本次提交的经营信息形成初步分析。"],
  ["summary:scenario:tax_operations", "当前经营资料以税务与经营周转场景为主。"],
  ["summary:scenario:amazon_sc", "当前经营资料以 Amazon 平台周转场景为主。"],
  ["summary:scenario:amazon_vc", "当前经营资料以 Amazon 供应链应收场景为主。"],
  ["summary:scenario:platform_ecommerce", "当前经营资料以平台电商周转场景为主。"],
  ["summary:scenario:b2b_supermarket", "当前经营资料以 B2B 应收周转场景为主。"],
  ["summary:scenario:general_import_export", "当前经营资料以进出口经营周转场景为主。"],
  ["summary:scenario:processing_manufacturing", "当前经营资料以加工制造周转场景为主。"],
  ["summary:scenario:wholesale_retail", "当前经营资料以批发零售周转场景为主。"],
  ["summary:scenario:other", "当前经营资料已按所选资金场景完成整理。"],
  ["summary:fund-use:inventory_procurement", "本次资金用途聚焦备货采购安排。"],
  ["summary:fund-use:logistics_working_capital", "本次资金用途聚焦物流经营周转。"],
  ["summary:fund-use:receivables_turnover", "本次资金用途聚焦应收账款周转。"],
  ["summary:fund-use:platform_operations", "本次资金用途聚焦平台经营周转。"],
  ["summary:fund-use:tax_business_operations", "本次资金用途聚焦税务与日常经营周转。"],
  ["summary:fund-use:other", "本次资金用途已纳入后续顾问复核。"],
]);

const DOCUMENT_ACTIONS = [
  ["entity-registration", "企业主体登记证明"],
  ["entity-region", "企业注册地证明"],
  ["operating-continuity", "企业登记及持续经营证明"],
  ["legal-representative-identity", "法人身份证明"],
  ["controller-experience", "实控人从业经历说明"],
  ["industry-operations", "主营业务及行业经营说明"],
  ["platform-operations", "主营业务及平台经营证明"],
  ["platform-or-buyer-cooperation", "平台店铺或核心买方合作证明"],
  ["operating-sites", "主要经营站点证明"],
  ["platform-trading-history", "平台交易历史证明"],
  ["buyer-trading-history", "买方交易历史证明"],
  ["platform-store-operations", "平台店铺经营证明"],
  ["platform-operating-data", "平台经营数据证明"],
  ["amazon-gmv-last-12-months", "Amazon 近 12 个月 GMV 证明"],
  ["sales-data-last-12-months", "近 12 个月销售数据证明"],
  ["collections-last-12-months", "近 12 个月回款记录"],
  ["financial-or-tax-summary-last-year", "近一年财务报表或纳税申报摘要"],
  ["b2b-trades-last-year", "近一年 B2B 交易流水或合同"],
  ["import-export-last-12-months", "近 12 个月进出口数据证明"],
  ["import-export-months-13-to-24", "13-24 个月进出口数据证明"],
  ["import-export-records-last-12-months", "近 12 个月进出口记录"],
  ["import-export-revenue-share", "进出口业务营收占比说明"],
  ["latest-import-export-record", "最近一次进出口记录"],
  ["self-operated-import-export", "自营进出口经营说明"],
  ["import-export-license", "进出口经营权证明"],
  ["foreign-exchange-classification", "外汇管理分类证明"],
  ["customs-credit-classification", "海关信用分类证明"],
  ["commodity-revenue-structure", "主营商品及营收结构说明"],
  ["sales-income-two-years", "近两年销售收入资料"],
  ["financial-and-liability-current", "近期财务报表及负债资料"],
  ["core-assets-and-liabilities", "核心资产负债资料"],
  ["financing-use-and-amount", "本次融资用途及金额说明"],
  ["tax-and-invoice", "纳税及发票资料"],
  ["refund-rate-last-three-months", "近 3 个月退款率数据"],
  ["amazon-store-status", "Amazon 店铺状态证明"],
  ["amazon-ahr", "Amazon AHR 数据"],
  ["fba-inventory-turnover", "FBA 库存周转数据"],
  ["borrower-collection-relationship", "借款主体与收款主体关系证明"],
  ["collection-account-arrangement", "回款账户安排确认"],
  ["compatible-collection-account", "兼容收款账户证明"],
  ["receivables-assignment", "应收账款转让安排确认"],
  ["noa-and-collection-account", "NOA 及回款账户安排确认"],
  ["receivables-detail", "应收账款明细"],
  ["buyer-location-admission", "买方所在地及准入证明"],
  ["buyer-platform-type", "买方平台类型证明"],
  ["buyer-country-admission", "买方国家准入核验资料"],
  ["existing-bank-credit", "现有银行授信情况说明"],
  ["repayment-status", "企业还款状态核验资料"],
  ["credit-and-judicial", "企业信用与司法信息核验资料"],
  ["company-personal-credit-and-judicial", "企业及个人信用与司法信息核验资料"],
  ["public-company-information", "企业公开信息核验资料"],
  ["settlement-account-opening", "结算账户开户证明"],
  ["applicant-identity", "申请人身份说明"],
  ["settlement-account-flow", "结算账户流水"],
  ["company-credit-rating", "企业信用评级资料"],
  ["credit-exposure-and-net-assets", "授信敞口及净资产资料"],
  ["company-risk-status", "企业风险状态核验资料"],
  ["company-compliance-status", "企业合规状态核验资料"],
  ["company-credit-status", "企业信用状态核验资料"],
  ["continuous-financial-statements", "连续财务报表"],
  ["controller-status", "实控人状态核验资料"],
  ["participating-store-history", "参与核额店铺经营记录"],
  ["amazon-first-order", "Amazon 首笔订单记录"],
];

const ACTION_TEXT_BY_CODE = new Map([
  ...DOCUMENT_ACTIONS.map(([code, text]) => [`action:document:${code}`, `准备${text}。`]),
  ["action:prepare-verifiable-business-materials", "整理可核验的经营资料，供顾问进一步复核。"],
]);
const ACTION_CODE_BY_DOCUMENT = new Map(
  DOCUMENT_ACTIONS.map(([code, text]) => [text, `action:document:${code}`]),
);

const fieldCategory = (field) => {
  const value = String(field ?? "").toLowerCase();
  if (/accountcontrol|collection|receivable|noa|repaymentmethod/.test(value)) return "回款账户安排";
  if (/overdue|credit|risk|blacklist|dishonesty|litigation|judicial|controllerstatus/.test(value)) return "风险核验";
  if (/region|entitytype|registered|applicantrole|representative/.test(value)) return "企业主体";
  if (/platform|businessmodel|amazon|buyer|industry|importexport|customs|foreignexchange/.test(value)) return "经营场景";
  if (/month|history|days|firstorder|companyage|experience/.test(value)) return "经营时长";
  if (/amount|gmv|revenue|sales|trade|ratio|percent|count|score|turnover|flow|rating|assets/.test(value)) return "平台经营规模";
  return "经营资料";
};

const ruleReferenceText = (rule, kind) => {
  const category = fieldCategory(rule.field);
  if (kind === "evidence") return `已提交的${category}信息已纳入该产品方向分析。`;
  return category === "回款账户安排"
    ? "回款账户安排仍需结合材料进一步核验。"
    : `${category}信息仍需结合材料进一步核验。`;
};

const productNameById = new Map(PRODUCT_CATALOG.map((product) => [product.id, product.name]));
const reasonTextByCode = new Map();
const confirmationTextByCode = new Map();
const advisorTextByCode = new Map();

for (const product of PRODUCT_CATALOG) {
  for (const rule of product.ruleSet) {
    const reasonCode = `evidence:${product.id}:${rule.id}`;
    const confirmationCode = `confirmation:${product.id}:${rule.id}`;
    const advisorCode = `advisor:${product.id}:${rule.id}`;
    if (rule.internalReason == null) reasonTextByCode.set(reasonCode, ruleReferenceText(rule, "evidence"));
    confirmationTextByCode.set(confirmationCode, ruleReferenceText(rule, "confirmation"));
    advisorTextByCode.set(
      advisorCode,
      `重点核验${productNameById.get(product.id)}的${fieldCategory(rule.field)}信息。`,
    );
  }
}

const ownRuleCodes = (productId, rules, expectedStatus, prefix, knownCodes) => {
  const result = [];
  for (const rule of Array.isArray(rules) ? rules : []) {
    if (
      rule == null
      || typeof rule !== "object"
      || Array.isArray(rule)
      || !Object.hasOwn(rule, "id")
      || !Object.hasOwn(rule, "status")
      || typeof rule.id !== "string"
      || rule.status !== expectedStatus
    ) continue;
    const code = `${prefix}:${productId}:${rule.id}`;
    if (!knownCodes.has(code) || result.includes(code)) continue;
    result.push(code);
    if (result.length === 3) break;
  }
  return result;
};

export const buildSummaryCodes = ({ scenario, facts } = {}) => {
  const result = ["summary:profile-submitted"];
  const scenarioCode = `summary:scenario:${scenario}`;
  if (SUMMARY_TEXT_BY_CODE.has(scenarioCode)) result.push(scenarioCode);
  const fundUseCode = `summary:fund-use:${facts?.fundUse}`;
  if (SUMMARY_TEXT_BY_CODE.has(fundUseCode)) result.push(fundUseCode);
  return result;
};

export const buildProductReferenceCodes = (productId, passedRules, unknownRules) => {
  const reasonCodes = ownRuleCodes(productId, passedRules, "passed", "evidence", reasonTextByCode);
  const confirmationCodes = ownRuleCodes(
    productId,
    unknownRules,
    "unknown",
    "confirmation",
    confirmationTextByCode,
  );
  return { reasonCodes, confirmationCodes };
};

export const buildPreparationActionCodes = (matchReport) => {
  const result = [];
  for (const document of Array.isArray(matchReport?.missingDocuments) ? matchReport.missingDocuments : []) {
    const code = ACTION_CODE_BY_DOCUMENT.get(document);
    if (code == null || result.includes(code)) continue;
    result.push(code);
    if (result.length === 5) break;
  }
  return result.length > 0 ? result : ["action:prepare-verifiable-business-materials"];
};

export const buildAdvisorFocusCodes = (products) => {
  const result = [];
  for (const product of Array.isArray(products) ? products : []) {
    for (const code of Array.isArray(product?.confirmationCodes) ? product.confirmationCodes : []) {
      const advisorCode = code.replace(/^confirmation:/, "advisor:");
      if (!advisorTextByCode.has(advisorCode) || result.includes(advisorCode)) continue;
      result.push(advisorCode);
      if (result.length === 5) return result;
    }
  }
  return result;
};

export const resolveSummaryCode = (code) => SUMMARY_TEXT_BY_CODE.get(code) ?? null;
export const resolveReasonCode = (code) => reasonTextByCode.get(code) ?? null;
export const resolveConfirmationCode = (code) => confirmationTextByCode.get(code) ?? null;
export const resolvePreparationActionCode = (code) => ACTION_TEXT_BY_CODE.get(code) ?? null;
export const resolveAdvisorFocusCode = (code) => advisorTextByCode.get(code) ?? null;
