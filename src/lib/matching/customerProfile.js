const ENUM_VALUES = Object.freeze({
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
  foreignExchangeClassification: Object.freeze(["a", "b", "c"]),
  amazonAccountStatus: Object.freeze(["normal", "abnormal"]),
  preferredCurrency: Object.freeze(["rmb", "usd"]),
});

const MONEY_FIELDS = Object.freeze([
  "singleStoreGmv",
  "allStoreSales",
  "allStoreRepayments",
  "averageMonthlyFbaInventoryValue",
  "importExportAmountLast12Months",
  "importExportAmountMonths13To24",
  "annualB2bTrade",
  "accountsReceivableBalance",
  "annualRevenue",
  "annualNetProfit",
  "totalApprovedCredit",
  "loanBalance",
  "requestedAmount",
]);

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
  "amazonAhrScore",
  "fbaInventoryTurnoverCount",
  "daysSinceLatestImportExport",
  "importExportCountLast12Months",
  "buyerTradingHistoryMonths",
  "averagePaymentTermDays",
  "creditBankCount",
  "preferredTermMonths",
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
  "hasAbnormalOperations",
  "acceptsAccountControl",
  "acceptsReceivablesAssignment",
]);

const asText = (value) => {
  if (value == null) return null;
  const normalized = String(value).trim();
  return normalized === "" ? null : normalized;
};

const asNumber = (value) => {
  if (value == null || (typeof value === "string" && value.trim() === "")) return null;
  try {
    return Number(value);
  } catch {
    return Number.NaN;
  }
};

const asBoolean = (value) => {
  if (value == null || (typeof value === "string" && value.trim() === "")) return null;
  if (value === true || value === false) return value;

  const normalized = String(value).trim().toLowerCase();
  if (["true", "yes"].includes(normalized)) return true;
  if (["false", "no"].includes(normalized)) return false;
  return normalized;
};

const asEnum = (value, allowedValues) => {
  const normalized = asText(value)?.toLowerCase() ?? null;
  if (normalized == null || allowedValues.includes(normalized)) return normalized;
  return normalized;
};

const asEnumList = (value, allowedValues) => {
  if (value == null || value === "") return [];
  const values = Array.isArray(value) ? value : [value];
  return values
    .map((item) => asEnum(item, allowedValues))
    .filter((item) => item != null);
};

const asMoney = (value, currency) => ({ amount: asNumber(value), currency });

const hasInvalidEnumValue = (value, allowedValues) => (
  value != null && !allowedValues.includes(value)
);

const validationError = (field, message) => ({ field, message });

export function normalizeCustomerProfile(input = {}) {
  const source = input && typeof input === "object" && !Array.isArray(input) ? input : {};
  const preferredCurrency = asEnum(source.preferredCurrency, ENUM_VALUES.preferredCurrency);
  const requestedAmountCurrency = preferredCurrency === "usd" ? "USD" : "RMB";

  return {
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

    businessModels: asEnumList(source.businessModels, ENUM_VALUES.businessModels),
    primaryPlatformOrBuyerName: asText(source.primaryPlatformOrBuyerName),
    platformSites: asEnumList(source.platformSites, []),
    platformHistoryMonths: asNumber(source.platformHistoryMonths),
    storeCount: asNumber(source.storeCount),
    selfOperatedImportExport: asBoolean(source.selfOperatedImportExport),
    hasImportExportLicense: asBoolean(source.hasImportExportLicense),

    singleStoreGmv: asMoney(source.singleStoreGmvUsd, "USD"),
    allStoreSales: asMoney(source.allStoreSalesRmb, "RMB"),
    allStoreRepayments: asMoney(source.allStoreRepaymentsRmb, "RMB"),
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
    buyerPlatformType: asText(source.buyerPlatformType),
    buyerTradingHistoryMonths: asNumber(source.buyerTradingHistoryMonths),
    annualB2bTrade: asMoney(source.annualB2bTradeUsd, "USD"),
    accountsReceivableBalance: asMoney(source.accountsReceivableBalanceUsd, "USD"),
    averagePaymentTermDays: asNumber(source.averagePaymentTermDays),
    acceptsNoa: asBoolean(source.acceptsNoa),

    annualRevenue: asMoney(source.annualRevenueRmb, "RMB"),
    annualNetProfit: asMoney(source.annualNetProfitRmb, "RMB"),
    taxRecordAndInvoiceCustomerTier: asText(source.taxRecordAndInvoiceCustomerTier),
    assetLiabilityRatioPercent: asNumber(source.assetLiabilityRatioPercent),
    coreAssetLiabilityRatioPercent: asNumber(source.coreAssetLiabilityRatioPercent),
    twoYearSalesDeclinePercent: asNumber(source.twoYearSalesDeclinePercent),
    creditBankCount: asNumber(source.creditBankCount),
    totalApprovedCredit: asMoney(source.totalApprovedCreditRmb, "RMB"),
    loanBalance: asMoney(source.loanBalanceRmb, "RMB"),
    hasCurrentOverdue: asBoolean(source.hasCurrentOverdue),
    hasDishonestyRecord: asBoolean(source.hasDishonestyRecord),
    hasMajorLitigation: asBoolean(source.hasMajorLitigation),
    hasAbnormalOperations: asBoolean(source.hasAbnormalOperations),

    preferredCurrency,
    requestedAmount: asMoney(source.requestedAmount, requestedAmountCurrency),
    fundUse: asText(source.fundUse),
    preferredTermMonths: asNumber(source.preferredTermMonths),
    preferredRepaymentMethod: asText(source.preferredRepaymentMethod),
    acceptsAccountControl: asBoolean(source.acceptsAccountControl),
    acceptsReceivablesAssignment: asBoolean(source.acceptsReceivablesAssignment),
    raw: input,
  };
}

export function validateCustomerProfile(profile, mode) {
  const errors = [];

  if (mode !== "simple" && mode !== "complex") {
    errors.push(validationError("mode", "must be simple or complex"));
  }

  if (!profile || typeof profile !== "object" || Array.isArray(profile)) {
    errors.push(validationError("profile", "must be a customer profile object"));
    return { valid: false, errors };
  }

  for (const [field, allowedValues] of Object.entries({
    entityRegion: ENUM_VALUES.entityRegion,
    entityType: ENUM_VALUES.entityType,
    foreignExchangeClassification: ENUM_VALUES.foreignExchangeClassification,
    amazonAccountStatus: ENUM_VALUES.amazonAccountStatus,
    preferredCurrency: ENUM_VALUES.preferredCurrency,
  })) {
    if (hasInvalidEnumValue(profile[field], allowedValues)) {
      errors.push(validationError(field, "contains an unknown value"));
    }
  }

  if (!Array.isArray(profile.businessModels)) {
    errors.push(validationError("businessModels", "must be a list"));
  } else if (profile.businessModels.some((value) => hasInvalidEnumValue(value, ENUM_VALUES.businessModels))) {
    errors.push(validationError("businessModels", "contains an unknown value"));
  }

  for (const field of BOOLEAN_FIELDS) {
    if (profile[field] != null && typeof profile[field] !== "boolean") {
      errors.push(validationError(field, "must be a boolean"));
    }
  }

  for (const field of MONEY_FIELDS) {
    const money = profile[field];
    if (!money || typeof money !== "object" || !["RMB", "USD"].includes(money.currency)) {
      errors.push(validationError(field, "must be a money value with RMB or USD currency"));
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
