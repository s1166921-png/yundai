import test from "node:test";
import assert from "node:assert/strict";
import { normalizeCustomerProfile, validateCustomerProfile } from "../src/lib/matching/customerProfile.js";
import { INTAKE_STEPS, getVisibleIntakeFields, validateIntakeStep } from "../src/lib/matching/intakeSchema.js";

const SCENARIOS = Object.freeze({
  amazon_sc: Object.freeze({
    values: Object.freeze({
      primaryBusinessModel: "amazon_sc",
      companyName: "Amazon SC Co.",
      entityRegion: "mainland",
      entityType: "limited_company",
      registeredProvince: "广东省",
      preferredCurrency: "usd",
      requestedAmount: 1000000,
      fundUse: "inventory_procurement",
      platformHistoryMonths: 18,
      platformSites: "united_states",
      storeCount: 2,
      singleStoreGmvUsd: 6000000,
      qualifiedStoreCount: 2,
      hasCurrentOverdue: false,
      hasMaterialCreditOrJudicialNegative: false,
      hasCompatibleCollectionAccount: true,
      acceptsAccountControl: true,
      includeWebankAssessment: true,
      amazonAhrScore: 95,
      amazonAccountStatus: "normal",
      fbaInventoryTurnoverCount: 6,
      borrowerMatchesCollectionEntity: true,
      participatingStoreOperatingDays: 400,
      contactName: "SC Contact",
      phone: "13800138000",
      consentToDataUse: true,
    }),
    submissionKeys: Object.freeze([
      "platformHistoryMonths", "singleStoreGmvUsd", "amazonAhrScore", "participatingStoreOperatingDays",
    ]),
    canonical: Object.freeze((profile) => {
      assert.equal(profile.platformHistoryMonths, 18);
      assert.deepEqual(profile.singleStoreGmv, { amount: 6000000, currency: "USD" });
      assert.equal(profile.amazonAhrScore, 95);
      assert.equal(profile.participatingStoreOperatingDays, 400);
    }),
  }),
  amazon_vc: Object.freeze({
    values: Object.freeze({
      primaryBusinessModel: "amazon_vc",
      companyName: "Amazon VC Co.",
      entityRegion: "hong_kong",
      entityType: "limited_company",
      preferredCurrency: "usd",
      requestedAmount: 800000,
      fundUse: "receivables_turnover",
      platformHistoryMonths: 20,
      platformSites: "united_states",
      amazonAnnualGmvUsd: 2500000,
      accountsReceivableBalanceUsd: 500000,
      hasCurrentOverdue: false,
      hasMaterialCreditOrJudicialNegative: false,
      acceptsAccountControl: true,
      acceptsReceivablesArrangement: true,
      contactName: "VC Contact",
      phone: "13800138001",
      consentToDataUse: true,
    }),
    submissionKeys: Object.freeze(["platformSites", "amazonAnnualGmvUsd", "accountsReceivableBalanceUsd"]),
    canonical: Object.freeze((profile) => {
      assert.deepEqual(profile.platformSites, ["united_states"]);
      assert.deepEqual(profile.amazonAnnualGmv, { amount: 2500000, currency: "USD" });
      assert.deepEqual(profile.accountsReceivableBalance, { amount: 500000, currency: "USD" });
      assert.equal(profile.acceptsNoa, true);
    }),
  }),
  b2b_supermarket: Object.freeze({
    values: Object.freeze({
      primaryBusinessModel: "b2b_supermarket",
      companyName: "B2B Supermarket Co.",
      entityRegion: "hong_kong",
      entityType: "limited_company",
      preferredCurrency: "usd",
      requestedAmount: 700000,
      fundUse: "receivables_turnover",
      buyerName: "Global Retail Buyer",
      buyerCountry: "Singapore",
      buyerTradingHistoryMonths: 24,
      annualB2bTradeUsd: 3000000,
      accountsReceivableBalanceUsd: 600000,
      hasCurrentOverdue: false,
      hasMaterialCreditOrJudicialNegative: false,
      acceptsAccountControl: true,
      acceptsReceivablesArrangement: true,
      contactName: "B2B Contact",
      phone: "13800138002",
      consentToDataUse: true,
    }),
    submissionKeys: Object.freeze(["buyerName", "buyerTradingHistoryMonths", "annualB2bTradeUsd"]),
    canonical: Object.freeze((profile) => {
      assert.equal(profile.primaryPlatformOrBuyerName, "Global Retail Buyer");
      assert.equal(profile.buyerTradingHistoryMonths, 24);
      assert.deepEqual(profile.annualB2bTrade, { amount: 3000000, currency: "USD" });
      assert.equal(profile.acceptsReceivablesAssignment, true);
    }),
  }),
  general_import_export: Object.freeze({
    values: Object.freeze({
      primaryBusinessModel: "general_import_export",
      companyName: "Import Export Co.",
      entityRegion: "mainland",
      entityType: "limited_company",
      registeredProvince: "广东省",
      preferredCurrency: "usd",
      requestedAmount: 600000,
      fundUse: "logistics_working_capital",
      controllerIndustryExperienceYears: 8,
      industry: "加工制造",
      hasSelfOperatedImportExportQualification: true,
      importExportAmountLast12MonthsUsd: 1200000,
      importExportAmountMonths13To24Usd: 900000,
      daysSinceLatestImportExport: 30,
      importExportCountLast12Months: 12,
      importExportRevenueSharePercent: 65,
      foreignExchangeClassification: "a",
      hasCurrentOverdue: false,
      hasMaterialCreditOrJudicialNegative: false,
      contactName: "Trade Contact",
      phone: "13800138003",
      consentToDataUse: true,
    }),
    submissionKeys: Object.freeze([
      "hasSelfOperatedImportExportQualification", "importExportAmountLast12MonthsUsd", "foreignExchangeClassification",
    ]),
    canonical: Object.freeze((profile) => {
      assert.equal(profile.selfOperatedImportExport, true);
      assert.equal(profile.hasImportExportLicense, true);
      assert.deepEqual(profile.importExportAmountLast12Months, { amount: 1200000, currency: "USD" });
      assert.deepEqual(profile.importExportAmountMonths13To24, { amount: 900000, currency: "USD" });
    }),
  }),
  tax_operations: Object.freeze({
    values: Object.freeze({
      primaryBusinessModel: "tax_operations",
      companyName: "Tax Operations Co.",
      entityRegion: "mainland",
      entityType: "limited_company",
      registeredProvince: "广东省",
      companyAgeMonths: 72,
      legalRepresentativeAge: 40,
      preferredCurrency: "rmb",
      requestedAmount: 500000,
      fundUse: "tax_business_operations",
      annualRevenueRmb: 18000000,
      assetLiabilityRatioPercent: 45,
      creditBankCount: 2,
      settlementAccountOpenedMonths: 36,
      settlementAccountFlowNormal: true,
      applicantRole: "法人",
      taxInvoiceAmountRmb: 16000000,
      supportsHighAmountAuthorization: true,
      hasCurrentOverdue: false,
      hasMaterialCreditOrJudicialNegative: false,
      contactName: "Tax Contact",
      phone: "13800138004",
      consentToDataUse: true,
    }),
    submissionKeys: Object.freeze(["registeredProvince", "annualRevenueRmb", "settlementAccountOpenedMonths"]),
    canonical: Object.freeze((profile) => {
      assert.equal(profile.registeredProvince, "广东省");
      assert.deepEqual(profile.annualRevenue, { amount: 18000000, currency: "RMB" });
      assert.equal(profile.settlementAccountOpenedMonths, 36);
      assert.equal(profile.settlementAccountFlowNormal, true);
    }),
  }),
});

const fallbackValueFor = (field) => {
  if (field.key === "companyName") return "Fallback Co.";
  if (field.key === "contactName") return "Fallback Contact";
  if (field.key === "phone") return "13800138000";
  if (field.key === "preferredCurrency") return "rmb";
  if (field.key === "requestedAmount") return 500000;
  if (field.key === "fundUse") return "inventory_procurement";
  if (field.key === "consentToDataUse") return true;
  if (field.type === "boolean") return false;
  if (field.type === "number") return Math.max(field.min ?? 0, 1);
  if (field.type === "select") return field.options[0].value;
  return `Synthetic ${field.key}`;
};

const visiblePayload = (profile) => ({
  intakeVersion: "progressive-v1",
  ...Object.fromEntries(
    getVisibleIntakeFields(profile).flatMap(({ key }) => (
      profile[key] == null || profile[key] === "" ? [] : [[key, profile[key]]]
    )),
  ),
});

const mergeVisibleStageValues = (profile, stage, values) => {
  let next = profile;
  let changed = true;

  while (changed) {
    changed = false;
    for (const field of getVisibleIntakeFields(next).filter(({ step }) => step === stage)) {
      const value = Object.hasOwn(values, field.key)
        ? values[field.key]
        : field.requiredFor.length > 0 ? fallbackValueFor(field) : undefined;
      if (value !== undefined && next[field.key] !== value) {
        next = { ...next, [field.key]: value };
        changed = true;
      }
    }
  }
  return next;
};

const journey = (primaryBusinessModel) => {
  const scenario = SCENARIOS[primaryBusinessModel];
  let profile = { intakeVersion: "progressive-v1" };
  const stageOne = mergeVisibleStageValues(profile, 1, scenario.values);
  assert.deepEqual(validateIntakeStep(stageOne, "progressive", 1), [], `${primaryBusinessModel} step 1`);

  profile = mergeVisibleStageValues(stageOne, 2, scenario.values);
  assert.deepEqual(validateIntakeStep(profile, "progressive", 2), [], `${primaryBusinessModel} step 2`);
  const laterStageState = Object.fromEntries(
    getVisibleIntakeFields(profile)
      .filter(({ key, step }) => step === 2 && profile[key] !== undefined)
      .map(({ key }) => [key, profile[key]]),
  );

  // Simulate returning to step 1, editing a visible field, then continuing through later steps.
  profile = { ...profile, companyName: `${scenario.values.companyName} Updated` };
  assert.deepEqual(validateIntakeStep(profile, "progressive", 1), [], `${primaryBusinessModel} back to step 1`);
  for (const [key, value] of Object.entries(laterStageState)) {
    assert.deepEqual(profile[key], value, `${primaryBusinessModel} retains ${key} after back navigation`);
  }

  profile = mergeVisibleStageValues(profile, 3, scenario.values);
  assert.deepEqual(validateIntakeStep(profile, "progressive", 3), [], `${primaryBusinessModel} step 3`);
  assert.deepEqual(validateIntakeStep(profile, "progressive", 2), [], `${primaryBusinessModel} continues after back navigation`);

  const payload = visiblePayload(profile);
  const normalized = normalizeCustomerProfile(payload);
  assert.deepEqual(validateCustomerProfile(normalized, "progressive").errors, []);
  assert.equal(normalized.intakeVersion, "progressive-v1");
  assert.equal(normalized.primaryBusinessModel, primaryBusinessModel);
  const standardProfile = { ...profile, includeWebankAssessment: false };
  assert.ok(getVisibleIntakeFields(standardProfile).length <= 23, `${primaryBusinessModel} exceeds the standard budget`);
  assert.ok(INTAKE_STEPS.every(({ id }) => getVisibleIntakeFields(profile).some(({ step }) => step === id)));
  for (const key of scenario.submissionKeys) assert.equal(Object.hasOwn(payload, key), true, `${primaryBusinessModel} submits ${key}`);
  scenario.canonical(normalized);

  return profile;
};

test("five representative progressive customer journeys populate visible scenario data stage by stage", () => {
  for (const primaryBusinessModel of Object.keys(SCENARIOS)) journey(primaryBusinessModel);
});

test("scenario switching retains visible state while removing hidden values from submission", () => {
  const amazonSc = journey("amazon_sc");
  const switched = { ...amazonSc, primaryBusinessModel: "amazon_vc" };
  const payload = visiblePayload(switched);

  assert.equal(switched.companyName, "Amazon SC Co. Updated");
  assert.equal(Object.hasOwn(payload, "singleStoreGmvUsd"), false);
  assert.equal(Object.hasOwn(payload, "amazonAhrScore"), false);
  assert.equal(Object.hasOwn(payload, "amazonAnnualGmvUsd"), false);
  assert.equal(normalizeCustomerProfile(payload).primaryBusinessModel, "amazon_vc");
});
