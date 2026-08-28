export const INTAKE_VERSION = "progressive-v1";

export const INTAKE_INFORMATION_USE_NOTICE = "您提交的联系方式和经营信息将由美鸥保存，用于产品匹配和融资顾问跟进；仅脱敏经营字段会发送至第三方 AI 辅助分析，企业身份与联系方式不会发送。结果仅供融资准备参考，不构成授信、审批或放款承诺。";

export const INTAKE_SUBMISSION_COPY = Object.freeze({
  loading: "正在整理经营信息、核对产品规则并生成初步分析…",
  success: "初步报告已生成，专业顾问将进一步复核。",
});

export const INTAKE_STEPS = Object.freeze([
  Object.freeze({ id: 1, title: "融资场景与需求", shortTitle: "场景" }),
  Object.freeze({ id: 2, title: "关键经营数据", shortTitle: "经营" }),
  Object.freeze({ id: 3, title: "风险确认与联系信息", shortTitle: "提交" }),
]);

export const PRIMARY_BUSINESS_MODELS = Object.freeze([
  "tax_operations", "amazon_sc", "amazon_vc", "platform_ecommerce",
  "b2b_supermarket", "general_import_export", "processing_manufacturing",
  "wholesale_retail", "other",
]);

const PROGRESSIVE_MODES = Object.freeze(["progressive", "simple", "complex"]);
const YES_NO_OPTIONS = Object.freeze([
  Object.freeze({ value: true, label: "是" }),
  Object.freeze({ value: false, label: "否" }),
]);
const primaryIs = (...models) => (profile) => models.includes(profile.primaryBusinessModel);
const hasPrimary = (profile) => PRIMARY_BUSINESS_MODELS.includes(profile.primaryBusinessModel);
const taxInMainland = (profile) => primaryIs("tax_operations")(profile) && profile.entityRegion === "mainland";
const webankExpanded = (profile) => primaryIs("amazon_sc")(profile) && profile.includeWebankAssessment === true;

const field = (definition) => Object.freeze({
  options: Object.freeze([]),
  requiredFor: Object.freeze([]),
  visibleWhen: () => true,
  unit: null,
  help: "",
  ...definition,
});

const textField = (key, step, label, definition = {}) => field({ key, step, label, type: "text", ...definition });
const numberField = (key, step, label, unit, definition = {}) => field({
  key, step, label, type: "number", unit, ...definition,
});
const booleanField = (key, step, label, definition = {}) => field({
  key, step, label, type: "boolean", options: YES_NO_OPTIONS, ...definition,
});
const selectField = (key, step, label, options, definition = {}) => field({
  key, step, label, type: "select", options: Object.freeze(options.map((option) => Object.freeze(option))), ...definition,
});
const required = Object.freeze({ requiredFor: PROGRESSIVE_MODES });

const BUSINESS_MODEL_OPTIONS = [
  { value: "tax_operations", label: "税务经营" },
  { value: "amazon_sc", label: "Amazon SC" },
  { value: "amazon_vc", label: "Amazon VC" },
  { value: "platform_ecommerce", label: "平台电商" },
  { value: "b2b_supermarket", label: "B2B 商超" },
  { value: "general_import_export", label: "一般进出口" },
  { value: "processing_manufacturing", label: "加工制造" },
  { value: "wholesale_retail", label: "批发零售" },
  { value: "other", label: "其他" },
];

const INTAKE_FIELDS = Object.freeze([
  textField("companyName", 1, "企业名称", required),
  selectField("primaryBusinessModel", 1, "主要融资场景", BUSINESS_MODEL_OPTIONS, required),
  selectField("entityRegion", 1, "注册主体", [
    { value: "mainland", label: "中国大陆" }, { value: "hong_kong", label: "中国香港" },
    { value: "united_states", label: "美国" }, { value: "other_overseas", label: "其他境外主体" },
  ], { visibleWhen: hasPrimary }),
  selectField("entityType", 1, "企业类型", [
    { value: "limited_company", label: "有限公司" }, { value: "individual_business", label: "个体工商户" },
    { value: "other", label: "其他" },
  ], { visibleWhen: hasPrimary }),
  textField("registeredProvince", 1, "注册省份", { visibleWhen: taxInMainland }),
  numberField("companyAgeMonths", 2, "企业成立时间", "个月", {
    visibleWhen: (profile) => primaryIs(
      "tax_operations", "general_import_export", "processing_manufacturing", "wholesale_retail", "platform_ecommerce", "other",
    )(profile) || webankExpanded(profile),
  }),
  numberField("legalRepresentativeAge", 2, "法人年龄", "岁", {
    min: 18, max: 100,
    visibleWhen: (profile) => primaryIs("tax_operations", "platform_ecommerce")(profile) || webankExpanded(profile),
  }),

  selectField("preferredCurrency", 2, "意向币种", [
    { value: "rmb", label: "人民币" }, { value: "usd", label: "美元" },
  ], required),
  numberField("requestedAmount", 2, "意向金额", "按所选币种计", required),
  selectField("fundUse", 2, "资金用途", [
    { value: "inventory_procurement", label: "采购备货" },
    { value: "logistics_working_capital", label: "物流周转" },
    { value: "receivables_turnover", label: "应收账款周转" },
    { value: "platform_operations", label: "平台经营周转" },
    { value: "tax_business_operations", label: "税务经营周转" },
    { value: "other", label: "其他经营用途" },
  ], required),
  numberField("annualRevenueRmb", 2, "年营业收入", "人民币元", {
    visibleWhen: primaryIs("tax_operations", "other"),
  }),
  numberField("assetLiabilityRatioPercent", 2, "资产负债率", "%", {
    min: 0, max: 100, visibleWhen: primaryIs(
      "tax_operations", "general_import_export", "processing_manufacturing", "wholesale_retail",
    ),
  }),
  numberField("creditBankCount", 2, "现有授信银行数量", "家", { visibleWhen: primaryIs("tax_operations") }),
  numberField("settlementAccountOpenedMonths", 2, "结算账户开户时长", "个月", { visibleWhen: primaryIs("tax_operations") }),
  booleanField("settlementAccountFlowNormal", 2, "结算账户流水是否正常", { visibleWhen: primaryIs("tax_operations") }),
  selectField("applicantRole", 2, "申请人身份", [
    { value: "法人", label: "法人" }, { value: "第一大自然人股东", label: "第一大自然人股东" },
    { value: "个体工商户负责人", label: "个体工商户负责人" },
  ], { visibleWhen: primaryIs("tax_operations") }),
  numberField("taxInvoiceAmountRmb", 2, "近 12 个月开票金额", "人民币元", { visibleWhen: primaryIs("tax_operations") }),
  booleanField("supportsHighAmountAuthorization", 2, "可提供大额融资所需授权", { visibleWhen: primaryIs("tax_operations") }),
  numberField("controllerIndustryExperienceYears", 2, "实控人从业年限", "年", {
    visibleWhen: primaryIs("general_import_export", "processing_manufacturing", "wholesale_retail"),
  }),
  selectField("industry", 2, "主营行业", [
    { value: "批发零售", label: "批发零售" }, { value: "加工制造", label: "加工制造" },
    { value: "跨境电商", label: "跨境电商" }, { value: "其他", label: "其他" },
  ], { visibleWhen: primaryIs("general_import_export", "processing_manufacturing", "wholesale_retail") }),
  booleanField("hasSelfOperatedImportExportQualification", 2, "具备自营进出口资质", {
    visibleWhen: primaryIs("general_import_export", "processing_manufacturing", "wholesale_retail"),
  }),
  numberField("platformHistoryMonths", 2, "平台交易历史", "个月", {
    visibleWhen: primaryIs("amazon_sc", "amazon_vc", "platform_ecommerce"),
  }),
  selectField("platformSites", 2, "主要经营站点", [
    { value: "united_states", label: "美国站" }, { value: "other", label: "其他站点" },
  ], { visibleWhen: primaryIs("amazon_sc", "amazon_vc", "platform_ecommerce") }),
  numberField("storeCount", 2, "经营店铺数量", "家", { visibleWhen: primaryIs("amazon_sc", "platform_ecommerce") }),
  numberField("singleStoreGmvUsd", 2, "单店近 12 个月 GMV", "美元", { visibleWhen: primaryIs("amazon_sc") }),
  numberField("amazonAnnualGmvUsd", 2, "Amazon 近 12 个月 GMV", "美元", { visibleWhen: primaryIs("amazon_vc") }),
  numberField("allStoreSalesRmb", 2, "所有店铺近 12 个月销售额", "人民币元", {
    visibleWhen: (profile) => primaryIs("platform_ecommerce")(profile) || webankExpanded(profile),
  }),
  numberField("platformRepaymentsLast12MonthsRmb", 2, "平台近 12 个月回款额", "人民币元", {
    visibleWhen: (profile) => primaryIs("platform_ecommerce")(profile) || webankExpanded(profile),
  }),
  numberField("refundRatePercent", 2, "近 3 个月退款率", "%", {
    min: 0, max: 100, visibleWhen: (profile) => primaryIs("platform_ecommerce")(profile) || webankExpanded(profile),
  }),
  numberField("qualifiedStoreCount", 2, "符合核额条件的店铺数", "家", { visibleWhen: primaryIs("amazon_sc", "platform_ecommerce") }),
  numberField("importExportAmountLast12MonthsUsd", 2, "近 12 个月进出口额", "美元", {
    visibleWhen: primaryIs("general_import_export", "processing_manufacturing", "wholesale_retail"),
  }),
  numberField("importExportAmountMonths13To24Usd", 2, "13-24 个月进出口额", "美元", {
    visibleWhen: primaryIs("general_import_export", "processing_manufacturing", "wholesale_retail"),
  }),
  numberField("daysSinceLatestImportExport", 2, "最近一次进出口距今天数", "天", {
    visibleWhen: primaryIs("general_import_export", "processing_manufacturing", "wholesale_retail"),
  }),
  numberField("importExportCountLast12Months", 2, "近 12 个月进出口次数", "次", {
    visibleWhen: primaryIs("general_import_export", "processing_manufacturing", "wholesale_retail"),
  }),
  numberField("importExportRevenueSharePercent", 2, "进出口业务占总营收比例", "%", {
    min: 0, max: 100, visibleWhen: primaryIs("general_import_export", "processing_manufacturing", "wholesale_retail"),
  }),
  selectField("foreignExchangeClassification", 2, "外汇管理分类", [
    { value: "a", label: "A 类" }, { value: "b", label: "B 类" }, { value: "c", label: "C 类" },
  ], { visibleWhen: primaryIs("general_import_export", "processing_manufacturing", "wholesale_retail") }),
  textField("buyerName", 2, "买方名称", { visibleWhen: primaryIs("b2b_supermarket") }),
  textField("buyerCountry", 2, "买方国家或地区", { visibleWhen: primaryIs("b2b_supermarket") }),
  numberField("buyerTradingHistoryMonths", 2, "与买方交易历史", "个月", { visibleWhen: primaryIs("b2b_supermarket") }),
  numberField("annualB2bTradeUsd", 2, "年交易额", "美元", { visibleWhen: primaryIs("b2b_supermarket") }),
  numberField("accountsReceivableBalanceUsd", 2, "当前应收账款余额", "美元", { visibleWhen: primaryIs("amazon_vc", "b2b_supermarket") }),

  booleanField("hasCompatibleCollectionAccount", 2, "已有兼容收款账户", { visibleWhen: primaryIs("amazon_sc", "platform_ecommerce") }),
  booleanField("includeWebankAssessment", 2, "进行微众银行评估", { visibleWhen: primaryIs("amazon_sc") }),
  numberField("amazonAhrScore", 2, "Amazon AHR 分数", "分", { visibleWhen: webankExpanded }),
  selectField("amazonAccountStatus", 2, "Amazon 账户状态", [
    { value: "normal", label: "正常" }, { value: "abnormal", label: "异常" },
  ], { visibleWhen: webankExpanded }),
  numberField("fbaInventoryTurnoverCount", 2, "FBA 库存周转次数", "次/年", { visibleWhen: webankExpanded }),
  booleanField("borrowerMatchesCollectionEntity", 2, "借款主体与收款主体一致", { visibleWhen: webankExpanded }),
  numberField("participatingStoreOperatingDays", 2, "参与核额店铺经营时长", "天", { visibleWhen: webankExpanded }),
  booleanField("acceptsAccountControl", 2, "接受回款账户控制", {
    visibleWhen: primaryIs("amazon_sc", "amazon_vc", "platform_ecommerce", "b2b_supermarket"),
  }),

  booleanField("hasCurrentOverdue", 3, "当前是否存在逾期", required),
  booleanField("hasMaterialCreditOrJudicialNegative", 3, "是否存在重大征信或司法负面记录", required),
  booleanField("acceptsReceivablesArrangement", 3, "接受应收账款安排", { visibleWhen: primaryIs("amazon_vc", "b2b_supermarket") }),
  textField("contactName", 3, "联系人", required),
  textField("phone", 3, "联系电话", { ...required, inputMode: "tel" }),
  field({ key: "consentToDataUse", step: 3, label: "我已了解并同意上述 AI 信息使用说明", type: "consent", ...required }),
]);

export const INTAKE_FIELD_KEYS = Object.freeze(INTAKE_FIELDS.map(({ key }) => key));

const isEmpty = (value) => value == null || value === "" || (Array.isArray(value) && value.length === 0);
const fieldError = (fieldDefinition, message) => ({ key: fieldDefinition.key, message });

export function getVisibleIntakeFields(profile = {}) {
  const safeProfile = profile && typeof profile === "object" && !Array.isArray(profile) ? profile : {};
  return INTAKE_FIELDS.filter((fieldDefinition) => fieldDefinition.visibleWhen(safeProfile));
}

export function validateIntakeStep(profile = {}, modeOrStep = "progressive", maybeStep) {
  const step = maybeStep ?? modeOrStep;
  const fields = getVisibleIntakeFields(profile).filter((fieldDefinition) => fieldDefinition.step === step);
  const errors = [];

  for (const fieldDefinition of fields) {
    const value = profile[fieldDefinition.key];
    if (fieldDefinition.key === "consentToDataUse" && value !== true) {
      errors.push(fieldError(fieldDefinition, "请勾选同意信息使用说明"));
      continue;
    }
    if (fieldDefinition.requiredFor.length > 0 && isEmpty(value)) {
      errors.push(fieldError(fieldDefinition, `请填写${fieldDefinition.label}`));
      continue;
    }
    if (isEmpty(value)) continue;
    if (fieldDefinition.type === "number") {
      const number = Number(value);
      if (!Number.isFinite(number) || number < (fieldDefinition.min ?? 0)) {
        errors.push(fieldError(fieldDefinition, `${fieldDefinition.label}需为有效的非负数值`));
      } else if (fieldDefinition.max != null && number > fieldDefinition.max) {
        errors.push(fieldError(fieldDefinition, `${fieldDefinition.label}不能超过 ${fieldDefinition.max}${fieldDefinition.unit ?? ""}`));
      }
    }
    if (fieldDefinition.key === "phone" && !/^[+\d][\d\s-]{5,19}$/.test(String(value).trim())) {
      errors.push(fieldError(fieldDefinition, "请输入有效的联系电话"));
    }
  }
  return errors;
}
