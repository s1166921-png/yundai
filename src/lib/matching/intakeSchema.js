export const INTAKE_STEPS = Object.freeze([
  Object.freeze({ id: 1, title: "企业与联系人", shortTitle: "企业" }),
  Object.freeze({ id: 2, title: "业务模式与经营地区", shortTitle: "业务" }),
  Object.freeze({ id: 3, title: "专项经营数据", shortTitle: "经营" }),
  Object.freeze({ id: 4, title: "财税、负债与风险", shortTitle: "财税" }),
  Object.freeze({ id: 5, title: "融资需求与控制意愿", shortTitle: "融资" }),
]);

const BOTH_MODES = Object.freeze(["simple", "complex"]);
const COMPLEX_MODE = Object.freeze(["complex"]);
const YES_NO_OPTIONS = Object.freeze([
  Object.freeze({ value: true, label: "是" }),
  Object.freeze({ value: false, label: "否" }),
]);

const BUSINESS_MODEL_OPTIONS = Object.freeze([
  Object.freeze({ value: "amazon_sc", label: "Amazon SC" }),
  Object.freeze({ value: "amazon_vc", label: "Amazon VC" }),
  Object.freeze({ value: "platform_ecommerce", label: "平台电商" }),
  Object.freeze({ value: "b2b_supermarket", label: "B2B 商超" }),
  Object.freeze({ value: "general_import_export", label: "一般进出口" }),
  Object.freeze({ value: "processing_manufacturing", label: "加工制造" }),
  Object.freeze({ value: "wholesale_retail", label: "批发零售" }),
  Object.freeze({ value: "other", label: "其他" }),
]);

const alwaysVisible = () => true;
const complexOnly = (_profile, mode) => mode === "complex";
const hasBusinessModel = (profile, model) => (
  Array.isArray(profile.businessModels) && profile.businessModels.includes(model)
);
const complexBusinessModels = (...models) => (profile, mode) => (
  mode === "complex" && models.some((model) => hasBusinessModel(profile, model))
);
const complexMainland = (profile, mode) => mode === "complex" && profile.entityRegion === "mainland";

const field = (definition) => Object.freeze({
  options: Object.freeze([]),
  requiredFor: Object.freeze([]),
  visibleWhen: alwaysVisible,
  unit: null,
  help: "",
  ...definition,
});

const textField = (key, step, label, definition = {}) => field({
  key,
  step,
  label,
  type: "text",
  ...definition,
});

const numberField = (key, step, label, unit, definition = {}) => field({
  key,
  step,
  label,
  type: "number",
  unit,
  ...definition,
});

const booleanField = (key, step, label, definition = {}) => field({
  key,
  step,
  label,
  type: "boolean",
  options: YES_NO_OPTIONS,
  ...definition,
});

const RATING_OPTIONS = Object.freeze([
  "5C", "5C+", "5B", "5B+", "5A", "5A+", "6A", "6A+", "6AA", "6AAA",
].map((value) => Object.freeze({ value, label: value })));

const INTAKE_FIELDS = Object.freeze([
  textField("companyName", 1, "企业名称", {
    requiredFor: BOTH_MODES,
    help: "请填写营业执照上的企业全称。",
  }),
  textField("contactName", 1, "联系人", {
    requiredFor: BOTH_MODES,
    help: "请填写便于后续沟通的联系人姓名。",
  }),
  textField("phone", 1, "联系电话", {
    requiredFor: BOTH_MODES,
    inputMode: "tel",
    help: "请填写可联系的手机或固定电话号码。",
  }),
  field({
    key: "entityRegion",
    step: 1,
    label: "注册主体",
    type: "select",
    options: Object.freeze([
      Object.freeze({ value: "mainland", label: "中国大陆" }),
      Object.freeze({ value: "hong_kong", label: "中国香港" }),
      Object.freeze({ value: "united_states", label: "美国" }),
      Object.freeze({ value: "other_overseas", label: "其他境外主体" }),
    ]),
    requiredFor: COMPLEX_MODE,
    visibleWhen: complexOnly,
    help: "请选择本次融资申请主体的注册地区。",
  }),
  textField("registeredProvince", 1, "注册省份", {
    requiredFor: COMPLEX_MODE,
    visibleWhen: complexMainland,
    help: "请填写营业执照登记省份。",
  }),
  textField("registeredCity", 1, "注册城市", {
    requiredFor: COMPLEX_MODE,
    visibleWhen: complexMainland,
    help: "请填写营业执照登记城市。",
  }),
  numberField("companyAgeMonths", 1, "企业成立时间", "个月", {
    requiredFor: COMPLEX_MODE,
    visibleWhen: complexOnly,
    help: "从企业成立日期起计算。",
  }),
  field({
    key: "entityType",
    step: 1,
    label: "企业类型",
    type: "select",
    options: Object.freeze([
      Object.freeze({ value: "limited_company", label: "有限公司" }),
      Object.freeze({ value: "individual_business", label: "个体工商户" }),
      Object.freeze({ value: "other", label: "其他" }),
    ]),
    requiredFor: COMPLEX_MODE,
    visibleWhen: complexOnly,
    help: "请选择营业执照登记的主体类型。",
  }),
  numberField("legalRepresentativeAge", 1, "法人年龄", "岁", {
    requiredFor: COMPLEX_MODE,
    visibleWhen: complexOnly,
    min: 18,
    max: 100,
  }),
  textField("industry", 1, "主营行业", {
    requiredFor: COMPLEX_MODE,
    visibleWhen: complexOnly,
    help: "例如消费电子、家居用品或服装。",
  }),

  field({
    key: "businessModels",
    step: 2,
    label: "业务模式",
    type: "checkboxes",
    options: BUSINESS_MODEL_OPTIONS,
    requiredFor: BOTH_MODES,
    help: "可多选，请勾选企业当前实际经营的全部模式。",
  }),
  field({
    key: "platformSites",
    step: 2,
    label: "主要经营站点",
    type: "checkboxes",
    options: Object.freeze([
      Object.freeze({ value: "united_states", label: "美国站" }),
      Object.freeze({ value: "other", label: "其他站点" }),
    ]),
    requiredFor: COMPLEX_MODE,
    visibleWhen: complexBusinessModels("amazon_sc", "amazon_vc", "platform_ecommerce"),
    help: "可多选当前贡献主要收入的经营站点。",
  }),
  numberField("platformHistoryMonths", 2, "平台交易历史", "个月", {
    requiredFor: COMPLEX_MODE,
    visibleWhen: complexBusinessModels("amazon_sc", "amazon_vc", "platform_ecommerce"),
    help: "从首笔平台订单起计算。",
  }),
  numberField("storeCount", 2, "经营店铺数量", "家", {
    requiredFor: COMPLEX_MODE,
    visibleWhen: complexBusinessModels("amazon_sc", "platform_ecommerce"),
  }),
  numberField("controllerIndustryExperienceYears", 2, "实控人从业年限", "年", {
    requiredFor: COMPLEX_MODE,
    visibleWhen: complexBusinessModels("processing_manufacturing"),
  }),
  booleanField("hasFixedBusinessPremises", 2, "是否有固定经营场所", {
    requiredFor: COMPLEX_MODE,
    visibleWhen: complexBusinessModels("processing_manufacturing", "wholesale_retail"),
  }),
  booleanField("selfOperatedImportExport", 2, "是否为自营进出口", {
    requiredFor: COMPLEX_MODE,
    visibleWhen: complexBusinessModels("general_import_export"),
  }),
  booleanField("hasImportExportLicense", 2, "是否拥有进出口经营权", {
    requiredFor: COMPLEX_MODE,
    visibleWhen: complexBusinessModels("general_import_export"),
  }),

  textField("primaryPlatformOrBuyerName", 3, "主要平台或买方名称", {
    requiredFor: BOTH_MODES,
    help: "请填写贡献主要收入的平台、店铺体系或核心买方。",
  }),
  numberField("singleStoreGmvUsd", 3, "单店近 12 个月 GMV", "美元", {
    requiredFor: COMPLEX_MODE,
    visibleWhen: complexBusinessModels("amazon_sc"),
  }),
  numberField("allStoreSalesRmb", 3, "所有店铺近 12 个月销售额", "人民币元", {
    requiredFor: COMPLEX_MODE,
    visibleWhen: complexBusinessModels(
      "amazon_sc",
      "platform_ecommerce",
      "processing_manufacturing",
      "wholesale_retail",
    ),
  }),
  numberField("allStoreRepaymentsRmb", 3, "所有店铺近 12 个月回款额", "人民币元", {
    requiredFor: COMPLEX_MODE,
    visibleWhen: complexBusinessModels("amazon_sc", "platform_ecommerce", "wholesale_retail"),
  }),
  numberField("revenueGrowthPercent", 3, "近 12 个月销售增长率", "%", {
    requiredFor: COMPLEX_MODE,
    visibleWhen: complexBusinessModels(
      "amazon_sc",
      "platform_ecommerce",
      "processing_manufacturing",
      "wholesale_retail",
    ),
    min: 0,
    max: 100,
  }),
  numberField("refundRatePercent", 3, "近 3 个月退款率", "%", {
    requiredFor: COMPLEX_MODE,
    visibleWhen: complexBusinessModels("amazon_sc", "platform_ecommerce"),
    min: 0,
    max: 100,
  }),
  numberField("amazonAhrScore", 3, "Amazon AHR 分数", "分", {
    requiredFor: COMPLEX_MODE,
    visibleWhen: complexBusinessModels("amazon_sc", "platform_ecommerce"),
  }),
  field({
    key: "amazonAccountStatus",
    step: 3,
    label: "Amazon 账户状态",
    type: "select",
    options: Object.freeze([
      Object.freeze({ value: "normal", label: "正常" }),
      Object.freeze({ value: "abnormal", label: "异常" }),
    ]),
    requiredFor: COMPLEX_MODE,
    visibleWhen: complexBusinessModels("amazon_sc", "platform_ecommerce"),
  }),
  numberField("fbaInventoryTurnoverCount", 3, "FBA 库存周转次数", "次/年", {
    requiredFor: COMPLEX_MODE,
    visibleWhen: complexBusinessModels("amazon_sc", "platform_ecommerce"),
  }),
  numberField("averageMonthlyFbaInventoryValueUsd", 3, "近 12 个月月均 FBA 库存价值", "美元", {
    requiredFor: COMPLEX_MODE,
    visibleWhen: complexBusinessModels("amazon_sc", "platform_ecommerce"),
  }),
  booleanField("borrowerMatchesCollectionEntity", 3, "借款主体与收款主体是否一致", {
    requiredFor: COMPLEX_MODE,
    visibleWhen: complexBusinessModels("amazon_sc", "amazon_vc", "platform_ecommerce"),
  }),
  numberField("qualifiedStoreCount", 3, "符合核额条件的店铺数", "家", {
    visibleWhen: complexBusinessModels("amazon_sc", "platform_ecommerce"),
    help: "可填写满足产品经营时长或销售条件的店铺数量。",
  }),
  numberField("firstOrderMonthsAgo", 3, "首笔平台订单距今", "个月", {
    visibleWhen: complexBusinessModels("amazon_sc", "platform_ecommerce"),
  }),
  numberField("participatingStoreOperatingDays", 3, "参与核额店铺经营时长", "天", {
    visibleWhen: complexBusinessModels("amazon_sc", "platform_ecommerce"),
  }),

  numberField("importExportAmountLast12MonthsUsd", 3, "近 12 个月进出口额", "美元", {
    requiredFor: COMPLEX_MODE,
    visibleWhen: complexBusinessModels("general_import_export"),
  }),
  numberField("importExportAmountMonths13To24Usd", 3, "13-24 个月进出口额", "美元", {
    requiredFor: COMPLEX_MODE,
    visibleWhen: complexBusinessModels("general_import_export"),
  }),
  numberField("daysSinceLatestImportExport", 3, "最近一次进出口距今天数", "天", {
    requiredFor: COMPLEX_MODE,
    visibleWhen: complexBusinessModels("general_import_export"),
  }),
  numberField("importExportCountLast12Months", 3, "近 12 个月进出口次数", "次", {
    requiredFor: COMPLEX_MODE,
    visibleWhen: complexBusinessModels("general_import_export"),
  }),
  numberField("importExportRevenueSharePercent", 3, "进出口业务占总营收比例", "%", {
    requiredFor: COMPLEX_MODE,
    visibleWhen: complexBusinessModels("general_import_export"),
    min: 0,
    max: 100,
  }),
  numberField("commodityRevenueSharePercent", 3, "大宗商品业务占比", "%", {
    requiredFor: COMPLEX_MODE,
    visibleWhen: complexBusinessModels("general_import_export"),
    min: 0,
    max: 100,
  }),
  field({
    key: "foreignExchangeClassification",
    step: 3,
    label: "外汇管理分类",
    type: "select",
    options: Object.freeze([
      Object.freeze({ value: "a", label: "A 类" }),
      Object.freeze({ value: "b", label: "B 类" }),
      Object.freeze({ value: "c", label: "C 类" }),
    ]),
    requiredFor: COMPLEX_MODE,
    visibleWhen: complexBusinessModels("general_import_export"),
  }),
  textField("customsCreditClassification", 3, "海关信用等级", {
    requiredFor: COMPLEX_MODE,
    visibleWhen: complexBusinessModels("general_import_export"),
    help: "例如高级认证企业、一般认证企业或一般信用企业。",
  }),

  textField("buyerName", 3, "买方名称", {
    requiredFor: COMPLEX_MODE,
    visibleWhen: complexBusinessModels("b2b_supermarket", "wholesale_retail"),
  }),
  textField("buyerCountry", 3, "买方国家或地区", {
    requiredFor: COMPLEX_MODE,
    visibleWhen: complexBusinessModels("b2b_supermarket", "wholesale_retail"),
  }),
  textField("buyerPlatformType", 3, "买方平台类型", {
    requiredFor: COMPLEX_MODE,
    visibleWhen: complexBusinessModels("b2b_supermarket"),
    help: "例如商超、平台采购或品牌方。",
  }),
  numberField("buyerTradingHistoryMonths", 3, "与买方交易历史", "个月", {
    requiredFor: COMPLEX_MODE,
    visibleWhen: complexBusinessModels("b2b_supermarket", "wholesale_retail"),
  }),
  numberField("annualB2bTradeUsd", 3, "年交易额", "美元", {
    requiredFor: COMPLEX_MODE,
    visibleWhen: complexBusinessModels("amazon_vc", "b2b_supermarket", "wholesale_retail"),
  }),
  numberField("accountsReceivableBalanceUsd", 3, "当前应收账款余额", "美元", {
    requiredFor: COMPLEX_MODE,
    visibleWhen: complexBusinessModels("amazon_vc", "b2b_supermarket"),
  }),
  numberField("averagePaymentTermDays", 3, "平均账期", "天", {
    requiredFor: COMPLEX_MODE,
    visibleWhen: complexBusinessModels("amazon_vc", "b2b_supermarket"),
  }),
  booleanField("acceptsNoa", 3, "是否接受发送 NOA", {
    requiredFor: COMPLEX_MODE,
    visibleWhen: complexBusinessModels("amazon_vc", "b2b_supermarket"),
    help: "NOA 指应收账款转让通知。",
  }),

  numberField("annualRevenueRmb", 4, "年营业收入", "人民币元", {
    requiredFor: BOTH_MODES,
  }),
  numberField("annualNetProfitRmb", 4, "年净利润", "人民币元", {
    requiredFor: COMPLEX_MODE,
    visibleWhen: complexOnly,
  }),
  numberField("taxInvoiceAmountRmb", 4, "近 12 个月开票金额", "人民币元", {
    visibleWhen: complexOnly,
  }),
  numberField("collectionsLast12MonthsRmb", 4, "近 12 个月回款金额", "人民币元", {
    visibleWhen: complexOnly,
  }),
  field({
    key: "taxRecordAndInvoiceCustomerTier",
    step: 4,
    label: "纳税与税票客群",
    type: "select",
    options: Object.freeze([
      Object.freeze({ value: "tax_invoice", label: "税票客群" }),
      Object.freeze({ value: "non_tax_invoice", label: "非税票客群" }),
    ]),
    visibleWhen: complexOnly,
  }),
  numberField("assetLiabilityRatioPercent", 4, "资产负债率", "%", {
    requiredFor: COMPLEX_MODE,
    visibleWhen: complexOnly,
    min: 0,
    max: 100,
  }),
  numberField("coreAssetLiabilityRatioPercent", 4, "核心资产负债率", "%", {
    visibleWhen: complexOnly,
    min: 0,
    max: 100,
  }),
  numberField("twoYearSalesDeclinePercent", 4, "近两年销售下降比例", "%", {
    visibleWhen: complexOnly,
    min: 0,
    max: 100,
  }),
  numberField("creditBankCount", 4, "现有授信银行数量", "家", {
    requiredFor: COMPLEX_MODE,
    visibleWhen: complexOnly,
  }),
  numberField("totalApprovedCreditRmb", 4, "已批授信总额", "人民币元", {
    visibleWhen: complexOnly,
  }),
  numberField("loanBalanceRmb", 4, "现有贷款余额", "人民币元", {
    visibleWhen: complexOnly,
  }),
  field({
    key: "applicantRole",
    step: 4,
    label: "申请人身份",
    type: "select",
    options: Object.freeze([
      Object.freeze({ value: "法人", label: "法人" }),
      Object.freeze({ value: "第一大自然人股东", label: "第一大自然人股东" }),
      Object.freeze({ value: "个体工商户负责人", label: "个体工商户负责人" }),
    ]),
    visibleWhen: complexOnly,
  }),
  numberField("settlementAccountOpenedMonths", 4, "结算账户开户时长", "个月", {
    visibleWhen: complexOnly,
  }),
  booleanField("settlementAccountFlowNormal", 4, "结算账户流水是否正常", {
    visibleWhen: complexOnly,
  }),
  field({
    key: "companyCreditRating",
    step: 4,
    label: "企业信用评级",
    type: "select",
    options: RATING_OPTIONS,
    visibleWhen: complexOnly,
  }),
  field({
    key: "internalBankRating",
    step: 4,
    label: "行内评级",
    type: "select",
    options: RATING_OPTIONS,
    visibleWhen: complexOnly,
  }),
  numberField("creditExposureToNetAssets", 4, "授信敞口与净资产比值", "倍", {
    visibleWhen: complexOnly,
  }),
  booleanField("hasCurrentOverdue", 4, "当前是否存在逾期", {
    requiredFor: BOTH_MODES,
  }),
  booleanField("hasDishonestyRecord", 4, "是否存在失信或限高", {
    requiredFor: BOTH_MODES,
  }),
  booleanField("hasMajorLitigation", 4, "是否存在重大诉讼", {
    requiredFor: BOTH_MODES,
  }),
  booleanField("hasAbnormalOperations", 4, "是否存在经营异常", {
    requiredFor: BOTH_MODES,
  }),
  booleanField("hasRiskWarning", 4, "是否存在风险预警", {
    visibleWhen: complexOnly,
  }),
  booleanField("isOnAmlBlacklist", 4, "是否命中反洗钱黑名单", {
    visibleWhen: complexOnly,
  }),
  booleanField("hasAdverseCreditStatus", 4, "是否存在不良或关注类信用状态", {
    visibleWhen: complexOnly,
  }),
  booleanField("financialStatementsContinuous", 4, "财务报表是否连续", {
    visibleWhen: complexOnly,
  }),
  booleanField("controllerStatusNormal", 4, "实际控制人状态是否正常", {
    visibleWhen: complexOnly,
  }),
  booleanField("spouseCreditAuthorization", 4, "是否可提供配偶征信授权", {
    visibleWhen: complexOnly,
  }),
  booleanField("controllerCreditAuthorization", 4, "是否可提供实控人征信授权", {
    visibleWhen: complexOnly,
  }),
  booleanField("applicableGuarantee", 4, "是否可提供相应担保", {
    visibleWhen: complexOnly,
  }),

  field({
    key: "preferredCurrency",
    step: 5,
    label: "意向币种",
    type: "select",
    options: Object.freeze([
      Object.freeze({ value: "rmb", label: "人民币" }),
      Object.freeze({ value: "usd", label: "美元" }),
    ]),
    requiredFor: BOTH_MODES,
  }),
  numberField("requestedAmount", 5, "意向金额", "按所选币种计", {
    requiredFor: BOTH_MODES,
    help: "金额币种以本步骤选择为准。",
  }),
  textField("fundUse", 5, "资金用途", {
    requiredFor: BOTH_MODES,
    help: "例如采购备货、物流周转或应收账款周转。",
  }),
  numberField("preferredTermMonths", 5, "期望期限", "个月", {
    visibleWhen: complexOnly,
  }),
  textField("preferredRepaymentMethod", 5, "偏好还款方式", {
    visibleWhen: complexOnly,
    help: "例如按月付息到期还本、等额本息或随借随还。",
  }),
  booleanField("acceptsAccountControl", 5, "是否接受回款账户切换或支付公司锁定", {
    requiredFor: COMPLEX_MODE,
    visibleWhen: complexBusinessModels("amazon_sc", "platform_ecommerce"),
  }),
  booleanField("acceptsReceivablesAssignment", 5, "是否接受应收账款转让", {
    requiredFor: COMPLEX_MODE,
    visibleWhen: complexBusinessModels("amazon_vc", "b2b_supermarket"),
  }),
]);

const isEmpty = (value) => (
  value == null
  || value === ""
  || (Array.isArray(value) && value.length === 0)
);

const isRequired = (fieldDefinition, mode) => fieldDefinition.requiredFor.includes(mode);

const fieldError = (fieldDefinition, message) => ({
  key: fieldDefinition.key,
  message,
});

export function getVisibleIntakeFields(profile = {}, mode = "simple") {
  const safeProfile = profile && typeof profile === "object" && !Array.isArray(profile) ? profile : {};
  const safeMode = mode === "complex" ? "complex" : "simple";
  return INTAKE_FIELDS.filter((fieldDefinition) => fieldDefinition.visibleWhen(safeProfile, safeMode));
}

export function validateIntakeStep(profile = {}, mode = "simple", step) {
  const fields = getVisibleIntakeFields(profile, mode).filter((fieldDefinition) => fieldDefinition.step === step);
  const errors = [];

  for (const fieldDefinition of fields) {
    const value = profile[fieldDefinition.key];
    if (isRequired(fieldDefinition, mode) && isEmpty(value)) {
      errors.push(fieldError(fieldDefinition, `请填写${fieldDefinition.label}`));
      continue;
    }

    if (isEmpty(value)) continue;

    if (fieldDefinition.type === "number") {
      const number = Number(value);
      if (!Number.isFinite(number) || number < (fieldDefinition.min ?? 0)) {
        errors.push(fieldError(fieldDefinition, `${fieldDefinition.label}需为有效的非负数值`));
        continue;
      }
      if (fieldDefinition.max != null && number > fieldDefinition.max) {
        errors.push(fieldError(fieldDefinition, `${fieldDefinition.label}不能超过 ${fieldDefinition.max}${fieldDefinition.unit ?? ""}`));
      }
    }

    if (fieldDefinition.key === "phone" && !/^[+\d][\d\s-]{5,19}$/.test(String(value).trim())) {
      errors.push(fieldError(fieldDefinition, "请输入有效的联系电话"));
    }
  }

  return errors;
}
