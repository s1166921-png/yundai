const ENUM_VALUES = Object.freeze({
  primaryBusinessModel: Object.freeze([
    "tax_operations",
    "amazon_sc",
    "amazon_vc",
    "platform_ecommerce",
    "b2b_supermarket",
    "general_import_export",
    "processing_manufacturing",
    "wholesale_retail",
    "other",
  ]),
  entityRegion: Object.freeze(["mainland", "hong_kong", "united_states", "other_overseas"]),
  entityType: Object.freeze(["limited_company", "individual_business", "other"]),
  businessModels: Object.freeze([
    "amazon_sc",
    "amazon_vc",
    "platform_ecommerce",
    "b2b_supermarket",
    "general_import_export",
    "processing_manufacturing",
    "wholesale_retail",
    "other",
  ]),
  platformSites: Object.freeze(["united_states", "other"]),
  foreignExchangeClassification: Object.freeze(["a", "b", "c"]),
  amazonAccountStatus: Object.freeze(["normal", "abnormal"]),
  preferredCurrency: Object.freeze(["rmb", "usd"]),
  applicantRole: Object.freeze(["法人", "第一大自然人股东", "个体工商户负责人"]),
  taxRecordAndInvoiceCustomerTier: Object.freeze(["tax_invoice", "non_tax_invoice"]),
  buyerPlatformType: Object.freeze(["admitted_1p_retailer", "other"]),
  buyerCountryEligibility: Object.freeze(["confirmed_admitted", "confirmed_not_admitted", "needs_review"]),
  fundUse: Object.freeze([
    "inventory_procurement",
    "logistics_working_capital",
    "receivables_turnover",
    "platform_operations",
    "tax_business_operations",
    "other",
  ]),
  preferredRepaymentMethod: Object.freeze([
    "revolving",
    "interest_then_principal",
    "equal_installments",
    "receivables_collection",
    "other",
  ]),
});

const RATING_VALUES = Object.freeze([
  "5C",
  "5C+",
  "5B",
  "5B+",
  "5A",
  "5A+",
  "6A",
  "6A+",
  "6AA",
  "6AAA",
]);

const MONEY_CURRENCIES = Object.freeze({
  singleStoreGmv: "USD",
  amazonAnnualGmv: "USD",
  allStoreSales: "RMB",
  allStoreRepayments: "RMB",
  averageMonthlyFbaInventoryValue: "USD",
  importExportAmountLast12Months: "USD",
  importExportAmountMonths13To24: "USD",
  annualB2bTrade: "USD",
  accountsReceivableBalance: "USD",
  annualRevenue: "RMB",
  annualNetProfit: "RMB",
  taxInvoiceAmount: "RMB",
  collectionsLast12Months: "RMB",
  totalApprovedCredit: "RMB",
  loanBalance: "RMB",
  requestedAmount: Object.freeze({ rmb: "RMB", usd: "USD", default: "RMB" }),
});

const PERCENTAGE_FIELDS = Object.freeze([
  "revenueGrowthPercent",
  "refundRatePercent",
  "importExportRevenueSharePercent",
  "commodityRevenueSharePercent",
  "assetLiabilityRatioPercent",
  "coreAssetLiabilityRatioPercent",
  "twoYearSalesDeclinePercent",
]);

const NON_NEGATIVE_NUMBER_FIELDS = Object.freeze([
  "companyAgeMonths",
  "controllerIndustryExperienceYears",
  "platformHistoryMonths",
  "storeCount",
  "qualifiedStoreCount",
  "amazonAhrScore",
  "fbaInventoryTurnoverCount",
  "daysSinceLatestImportExport",
  "importExportCountLast12Months",
  "buyerTradingHistoryMonths",
  "averagePaymentTermDays",
  "creditBankCount",
  "preferredTermMonths",
  "settlementAccountOpenedMonths",
  "creditExposureToNetAssets",
  "firstOrderMonthsAgo",
  "participatingStoreOperatingDays",
]);

const BOOLEAN_FIELDS = Object.freeze([
  "hasFixedBusinessPremises",
  "selfOperatedImportExport",
  "hasImportExportLicense",
  "borrowerMatchesCollectionEntity",
  "acceptsNoa",
  "hasCurrentOverdue",
  "hasDishonestyRecord",
  "hasMajorLitigation",
  "hasMaterialCreditOrJudicialNegative",
  "hasAbnormalOperations",
  "acceptsAccountControl",
  "hasCompatibleCollectionAccount",
  "acceptsReceivablesAssignment",
  "settlementAccountFlowNormal",
  "hasRiskWarning",
  "isOnAmlBlacklist",
  "hasAdverseCreditStatus",
  "financialStatementsContinuous",
  "controllerStatusNormal",
  "spouseCreditAuthorization",
  "controllerCreditAuthorization",
  "applicableGuarantee",
  "consentToDataUse",
]);

export const PROGRESSIVE_CUSTOMER_PROFILE_FIELDS = Object.freeze([
  "entityRegion",
  "entityType",
  "registeredProvince",
  "companyAgeMonths",
  "annualRevenue",
  "assetLiabilityRatioPercent",
  "creditBankCount",
  "settlementAccountOpenedMonths",
  "settlementAccountFlowNormal",
  "applicantRole",
  "legalRepresentativeAge",
  "taxInvoiceAmount",
  "controllerIndustryExperienceYears",
  "industry",
  "selfOperatedImportExport",
  "hasImportExportLicense",
  "importExportAmountLast12Months",
  "importExportAmountMonths13To24",
  "daysSinceLatestImportExport",
  "importExportCountLast12Months",
  "importExportRevenueSharePercent",
  "foreignExchangeClassification",
  "platformHistoryMonths",
  "platformSites",
  "storeCount",
  "singleStoreGmv",
  "qualifiedStoreCount",
  "hasCompatibleCollectionAccount",
  "acceptsAccountControl",
  "allStoreSales",
  "allStoreRepayments",
  "collectionsLast12Months",
  "refundRatePercent",
  "amazonAhrScore",
  "amazonAccountStatus",
  "fbaInventoryTurnoverCount",
  "borrowerMatchesCollectionEntity",
  "participatingStoreOperatingDays",
  "amazonAnnualGmv",
  "acceptsNoa",
  "acceptsReceivablesAssignment",
  "accountsReceivableBalance",
  "buyerName",
  "buyerCountry",
  "buyerTradingHistoryMonths",
  "annualB2bTrade",
  "businessModels",
  "primaryPlatformOrBuyerName",
  "hasCurrentOverdue",
  "hasMaterialCreditOrJudicialNegative",
  "requestedAmount",
  "fundUse",
  "consentToDataUse",
]);

export const isProgressiveCustomerProfileField = (path) => (
  typeof path === "string"
  && PROGRESSIVE_CUSTOMER_PROFILE_FIELDS.includes(path.split(".")[0])
);

const TEXT_FIELDS = Object.freeze([
  "companyName",
  "contactName",
  "phone",
  "registeredProvince",
  "registeredCity",
  "industry",
  "primaryPlatformOrBuyerName",
  "customsCreditClassification",
  "buyerName",
  "buyerCountry",
]);

const asText = (value) => {
  if (value == null) return null;
  if (typeof value !== "string") return Number.NaN;
  const normalized = value.trim();
  return normalized === "" ? null : normalized;
};

const asNumber = (value) => {
  if (value == null) return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : Number.NaN;
  if (typeof value !== "string") return Number.NaN;
  const normalized = value.trim();
  if (normalized === "") return null;
  const number = Number(normalized);
  return Number.isFinite(number) ? number : Number.NaN;
};

const asBoolean = (value) => {
  if (value == null) return null;
  if (value === true || value === false) return value;
  if (typeof value !== "string") return Number.NaN;

  const normalized = value.trim().toLowerCase();
  if (normalized === "") return null;
  if (["true", "yes"].includes(normalized)) return true;
  if (["false", "no"].includes(normalized)) return false;
  return normalized;
};

const asEnum = (value, allowedValues) => {
  const text = asText(value);
  if (text == null || typeof text !== "string") return text;
  const normalized = text.toLowerCase();
  if (allowedValues.includes(normalized)) return normalized;
  return normalized;
};

const asRating = (value) => {
  const text = asText(value);
  return typeof text === "string" ? text.toUpperCase() : text;
};

const asEnumList = (value, allowedValues) => {
  if (value == null || value === "") return [];
  const values = Array.isArray(value) ? value : [value];
  return values
    .map((item) => asEnum(item, allowedValues))
    .filter((item) => item != null);
};

const asMoney = (value, currency) => ({ amount: asNumber(value), currency });

const asInputMoney = (source, amountField, structuredField, currency) => {
  if (Object.hasOwn(source, amountField)) return asMoney(source[amountField], currency);
  const structuredValue = source[structuredField];
  if (structuredValue == null) return asMoney(null, currency);
  if (typeof structuredValue !== "object" || Array.isArray(structuredValue)) {
    return { amount: Number.NaN, currency };
  }
  return {
    amount: asNumber(structuredValue.amount),
    currency: structuredValue.currency == null
      ? currency
      : typeof structuredValue.currency === "string"
        ? structuredValue.currency.trim().toUpperCase()
        : structuredValue.currency,
  };
};

const hasInvalidEnumValue = (value, allowedValues) => (
  value != null && !allowedValues.includes(value)
);

const validationError = (field, message) => ({ field, message });

const expectedMoneyCurrency = (field, profile) => {
  const currency = MONEY_CURRENCIES[field];
  return typeof currency === "string" ? currency : currency[profile.preferredCurrency] ?? currency.default;
};

export function normalizeCustomerProfile(input = {}) {
  const source = input && typeof input === "object" && !Array.isArray(input) ? input : {};
  const preferredCurrency = asEnum(source.preferredCurrency, ENUM_VALUES.preferredCurrency);
  const requestedAmountCurrency = preferredCurrency === "usd" ? "USD" : "RMB";
  const legacyBusinessModels = asEnumList(source.businessModels, ENUM_VALUES.businessModels);
  const hasProgressivePrimaryBusinessModel = Object.hasOwn(source, "primaryBusinessModel");
  const primaryBusinessModel = hasProgressivePrimaryBusinessModel
    ? asEnum(source.primaryBusinessModel, ENUM_VALUES.primaryBusinessModel)
    : null;
  const businessModels = hasProgressivePrimaryBusinessModel
    ? primaryBusinessModel === "tax_operations" || primaryBusinessModel === "other"
      ? []
      : [primaryBusinessModel]
    : legacyBusinessModels;
  const isAmazon = ["amazon_sc", "amazon_vc", "platform_ecommerce"].includes(primaryBusinessModel);
  const hasTradeQualification = Object.hasOwn(source, "hasSelfOperatedImportExportQualification")
    ? asBoolean(source.hasSelfOperatedImportExportQualification)
    : asBoolean(source.selfOperatedImportExport);
  const acceptsReceivables = Object.hasOwn(source, "acceptsReceivablesArrangement")
    ? asBoolean(source.acceptsReceivablesArrangement)
    : null;
  const platformRepayments = Object.hasOwn(source, "platformRepaymentsLast12MonthsRmb")
    ? asMoney(source.platformRepaymentsLast12MonthsRmb, "RMB")
    : asMoney(source.allStoreRepaymentsRmb, "RMB");
  const collectionsLast12Months = Object.hasOwn(source, "platformRepaymentsLast12MonthsRmb")
    ? asMoney(source.platformRepaymentsLast12MonthsRmb, "RMB")
    : asInputMoney(source, "collectionsLast12MonthsRmb", "collectionsLast12Months", "RMB");

  return {
    intakeVersion: source.intakeVersion === "progressive-v1" ? "progressive-v1" : null,
    companyName: asText(source.companyName),
    contactName: asText(source.contactName),
    phone: asText(source.phone),
    entityRegion: asEnum(source.entityRegion, ENUM_VALUES.entityRegion),
    registeredProvince: asText(source.registeredProvince),
    registeredCity: asText(source.registeredCity),
    companyAgeMonths: asNumber(source.companyAgeMonths),
    entityType: asEnum(source.entityType, ENUM_VALUES.entityType),
    legalRepresentativeAge: asNumber(source.legalRepresentativeAge),
    controllerIndustryExperienceYears: asNumber(source.controllerIndustryExperienceYears),
    industry: asText(source.industry),
    hasFixedBusinessPremises: asBoolean(source.hasFixedBusinessPremises),

    primaryBusinessModel,
    businessModels,
    primaryPlatformOrBuyerName: hasProgressivePrimaryBusinessModel
      ? isAmazon ? "Amazon" : asText(source.buyerName)
      : asText(source.primaryPlatformOrBuyerName),
    platformSites: asEnumList(source.platformSites, ENUM_VALUES.platformSites),
    platformHistoryMonths: asNumber(source.platformHistoryMonths),
    storeCount: asNumber(source.storeCount),
    qualifiedStoreCount: asNumber(source.qualifiedStoreCount),
    selfOperatedImportExport: hasTradeQualification,
    hasImportExportLicense: hasProgressivePrimaryBusinessModel
      ? hasTradeQualification
      : asBoolean(source.hasImportExportLicense),

    singleStoreGmv: asMoney(source.singleStoreGmvUsd, "USD"),
    amazonAnnualGmv: asMoney(source.amazonAnnualGmvUsd, "USD"),
    allStoreSales: asMoney(source.allStoreSalesRmb, "RMB"),
    allStoreRepayments: platformRepayments,
    revenueGrowthPercent: asNumber(source.revenueGrowthPercent),
    refundRatePercent: asNumber(source.refundRatePercent),
    amazonAhrScore: asNumber(source.amazonAhrScore),
    amazonAccountStatus: asEnum(source.amazonAccountStatus, ENUM_VALUES.amazonAccountStatus),
    fbaInventoryTurnoverCount: asNumber(source.fbaInventoryTurnoverCount),
    averageMonthlyFbaInventoryValue: asMoney(source.averageMonthlyFbaInventoryValueUsd, "USD"),
    borrowerMatchesCollectionEntity: asBoolean(source.borrowerMatchesCollectionEntity),

    importExportAmountLast12Months: asMoney(source.importExportAmountLast12MonthsUsd, "USD"),
    importExportAmountMonths13To24: asMoney(source.importExportAmountMonths13To24Usd, "USD"),
    daysSinceLatestImportExport: asNumber(source.daysSinceLatestImportExport),
    importExportCountLast12Months: asNumber(source.importExportCountLast12Months),
    importExportRevenueSharePercent: asNumber(source.importExportRevenueSharePercent),
    commodityRevenueSharePercent: asNumber(source.commodityRevenueSharePercent),
    foreignExchangeClassification: asEnum(source.foreignExchangeClassification, ENUM_VALUES.foreignExchangeClassification),
    customsCreditClassification: asText(source.customsCreditClassification),

    buyerName: asText(source.buyerName),
    buyerCountry: asText(source.buyerCountry),
    buyerPlatformType: asEnum(source.buyerPlatformType, ENUM_VALUES.buyerPlatformType),
    buyerCountryEligibility: asEnum(source.buyerCountryEligibility, ENUM_VALUES.buyerCountryEligibility),
    buyerTradingHistoryMonths: asNumber(source.buyerTradingHistoryMonths),
    annualB2bTrade: asMoney(source.annualB2bTradeUsd, "USD"),
    accountsReceivableBalance: asMoney(source.accountsReceivableBalanceUsd, "USD"),
    averagePaymentTermDays: asNumber(source.averagePaymentTermDays),
    acceptsNoa: acceptsReceivables ?? asBoolean(source.acceptsNoa),

    annualRevenue: asMoney(source.annualRevenueRmb, "RMB"),
    annualNetProfit: asMoney(source.annualNetProfitRmb, "RMB"),
    taxInvoiceAmount: asInputMoney(source, "taxInvoiceAmountRmb", "taxInvoiceAmount", "RMB"),
    collectionsLast12Months,
    taxRecordAndInvoiceCustomerTier: asEnum(
      source.taxRecordAndInvoiceCustomerTier,
      ENUM_VALUES.taxRecordAndInvoiceCustomerTier,
    ),
    assetLiabilityRatioPercent: asNumber(source.assetLiabilityRatioPercent),
    coreAssetLiabilityRatioPercent: asNumber(source.coreAssetLiabilityRatioPercent),
    twoYearSalesDeclinePercent: asNumber(source.twoYearSalesDeclinePercent),
    creditBankCount: asNumber(source.creditBankCount),
    totalApprovedCredit: asMoney(source.totalApprovedCreditRmb, "RMB"),
    loanBalance: asMoney(source.loanBalanceRmb, "RMB"),
    hasCurrentOverdue: asBoolean(source.hasCurrentOverdue),
    hasDishonestyRecord: asBoolean(source.hasDishonestyRecord),
    hasMajorLitigation: asBoolean(source.hasMajorLitigation),
    hasMaterialCreditOrJudicialNegative: asBoolean(source.hasMaterialCreditOrJudicialNegative),
    hasAbnormalOperations: asBoolean(source.hasAbnormalOperations),

    preferredCurrency,
    requestedAmount: asMoney(source.requestedAmount, requestedAmountCurrency),
    fundUse: asEnum(source.fundUse, ENUM_VALUES.fundUse),
    preferredTermMonths: asNumber(source.preferredTermMonths),
    preferredRepaymentMethod: asEnum(source.preferredRepaymentMethod, ENUM_VALUES.preferredRepaymentMethod),
    acceptsAccountControl: asBoolean(source.acceptsAccountControl),
    hasCompatibleCollectionAccount: asBoolean(source.hasCompatibleCollectionAccount),
    acceptsReceivablesAssignment: acceptsReceivables ?? asBoolean(source.acceptsReceivablesAssignment),

    applicantRole: asEnum(source.applicantRole, ENUM_VALUES.applicantRole),
    settlementAccountOpenedMonths: asNumber(source.settlementAccountOpenedMonths),
    settlementAccountFlowNormal: asBoolean(source.settlementAccountFlowNormal),
    companyCreditRating: asRating(source.companyCreditRating),
    internalBankRating: asRating(source.internalBankRating),
    creditExposureToNetAssets: asNumber(source.creditExposureToNetAssets),
    hasRiskWarning: asBoolean(source.hasRiskWarning),
    isOnAmlBlacklist: asBoolean(source.isOnAmlBlacklist),
    hasAdverseCreditStatus: asBoolean(source.hasAdverseCreditStatus),
    financialStatementsContinuous: asBoolean(source.financialStatementsContinuous),
    controllerStatusNormal: asBoolean(source.controllerStatusNormal),
    spouseCreditAuthorization: asBoolean(source.spouseCreditAuthorization),
    controllerCreditAuthorization: asBoolean(source.controllerCreditAuthorization),
    applicableGuarantee: asBoolean(source.applicableGuarantee),
    firstOrderMonthsAgo: asNumber(source.firstOrderMonthsAgo),
    participatingStoreOperatingDays: asNumber(source.participatingStoreOperatingDays),
    consentToDataUse: asBoolean(source.consentToDataUse),
  };
}

export function validateCustomerProfile(profile, mode) {
  const errors = [];

  if (mode !== "simple" && mode !== "complex" && mode !== "progressive") {
    errors.push(validationError("mode", "must be simple, complex, or progressive"));
  }

  if (!profile || typeof profile !== "object" || Array.isArray(profile)) {
    errors.push(validationError("profile", "must be a customer profile object"));
    return { valid: false, errors };
  }

  for (const field of TEXT_FIELDS) {
    if (profile[field] != null && typeof profile[field] !== "string") {
      errors.push(validationError(field, "must be text"));
    }
  }

  for (const [field, allowedValues] of Object.entries({
    primaryBusinessModel: ENUM_VALUES.primaryBusinessModel,
    entityRegion: ENUM_VALUES.entityRegion,
    entityType: ENUM_VALUES.entityType,
    foreignExchangeClassification: ENUM_VALUES.foreignExchangeClassification,
    amazonAccountStatus: ENUM_VALUES.amazonAccountStatus,
    preferredCurrency: ENUM_VALUES.preferredCurrency,
    applicantRole: ENUM_VALUES.applicantRole,
    taxRecordAndInvoiceCustomerTier: ENUM_VALUES.taxRecordAndInvoiceCustomerTier,
    buyerPlatformType: ENUM_VALUES.buyerPlatformType,
    buyerCountryEligibility: ENUM_VALUES.buyerCountryEligibility,
    fundUse: ENUM_VALUES.fundUse,
    preferredRepaymentMethod: ENUM_VALUES.preferredRepaymentMethod,
  })) {
    if (hasInvalidEnumValue(profile[field], allowedValues)) {
      errors.push(validationError(field, "contains an unknown value"));
    }
  }

  for (const field of ["companyCreditRating", "internalBankRating"]) {
    if (hasInvalidEnumValue(profile[field], RATING_VALUES)) {
      errors.push(validationError(field, "contains an unknown value"));
    }
  }

  for (const [field, allowedValues] of Object.entries({
    businessModels: ENUM_VALUES.businessModels,
    platformSites: ENUM_VALUES.platformSites,
  })) {
    if (!Array.isArray(profile[field])) {
      errors.push(validationError(field, "must be a list"));
    } else if (profile[field].some((value) => hasInvalidEnumValue(value, allowedValues))) {
      errors.push(validationError(field, "contains an unknown value"));
    }
  }

  for (const field of BOOLEAN_FIELDS) {
    if (profile[field] != null && typeof profile[field] !== "boolean") {
      errors.push(validationError(field, "must be a boolean"));
    }
  }

  for (const field of Object.keys(MONEY_CURRENCIES)) {
    const money = profile[field];
    const currency = expectedMoneyCurrency(field, profile);
    if (!money || typeof money !== "object" || money.currency !== currency) {
      errors.push(validationError(field, `must be a money value in ${currency}`));
      continue;
    }
    if (money.amount != null && (!Number.isFinite(money.amount) || money.amount < 0)) {
      errors.push(validationError(field, "amount must be a non-negative finite number"));
    }
  }

  for (const field of PERCENTAGE_FIELDS) {
    const value = profile[field];
    if (value != null && (!Number.isFinite(value) || value < 0 || value > 100)) {
      errors.push(validationError(field, "must be a finite percentage from 0 through 100"));
    }
  }

  const age = profile.legalRepresentativeAge;
  if (age != null && (!Number.isFinite(age) || age < 18 || age > 100)) {
    errors.push(validationError("legalRepresentativeAge", "must be a finite age from 18 through 100"));
  }

  for (const field of NON_NEGATIVE_NUMBER_FIELDS) {
    const value = profile[field];
    if (value != null && (!Number.isFinite(value) || value < 0)) {
      errors.push(validationError(field, "must be a non-negative finite number"));
    }
  }

  return { valid: errors.length === 0, errors };
}
