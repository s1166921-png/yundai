import test from "node:test";
import assert from "node:assert/strict";
import {
  INTAKE_STEPS,
  PRIMARY_BUSINESS_MODELS,
  getVisibleIntakeFields,
  validateIntakeStep,
} from "../src/lib/matching/intakeSchema.js";

const fieldKeys = (profile) => getVisibleIntakeFields(profile).map(({ key }) => key);

test("progressive intake has three stable stages and one primary scenario", () => {
  assert.deepEqual(INTAKE_STEPS.map(({ id }) => id), [1, 2, 3]);
  const fields = getVisibleIntakeFields({ primaryBusinessModel: "amazon_sc" });
  assert.equal(fields.find(({ key }) => key === "primaryBusinessModel").type, "select");
  assert.equal(fields.some(({ key }) => key === "businessModels"), false);
});

test("every standard scenario stays within the 26-field budget", () => {
  for (const primaryBusinessModel of PRIMARY_BUSINESS_MODELS) {
    const fields = getVisibleIntakeFields({ primaryBusinessModel, entityRegion: "mainland" });
    assert.ok(fields.length <= 26, `${primaryBusinessModel}: ${fields.length}`);
  }
});

test("Amazon SC WeBank expansion is explicit and isolated", () => {
  const base = getVisibleIntakeFields({ primaryBusinessModel: "amazon_sc", includeWebankAssessment: false });
  const expanded = getVisibleIntakeFields({ primaryBusinessModel: "amazon_sc", includeWebankAssessment: true });
  assert.equal(base.some(({ key }) => key === "amazonAhrScore"), false);
  assert.equal(expanded.some(({ key }) => key === "amazonAhrScore"), true);
});

test("WeBank expansion collects every customer-stage fact in step two without leaking into base SC", () => {
  const base = getVisibleIntakeFields({ primaryBusinessModel: "amazon_sc", entityRegion: "mainland", includeWebankAssessment: false });
  const expanded = getVisibleIntakeFields({ primaryBusinessModel: "amazon_sc", entityRegion: "mainland", includeWebankAssessment: true });
  const requiredExpansionKeys = [
    "companyAgeMonths", "legalRepresentativeAge", "allStoreSalesRmb", "platformRepaymentsLast12MonthsRmb",
    "refundRatePercent", "amazonAhrScore", "amazonAccountStatus", "fbaInventoryTurnoverCount",
    "borrowerMatchesCollectionEntity", "participatingStoreOperatingDays",
  ];

  assert.equal(base.find(({ key }) => key === "includeWebankAssessment")?.step, 2);
  assert.equal(base.some(({ key }) => requiredExpansionKeys.includes(key)), false);
  assert.deepEqual(expanded.filter(({ key }) => requiredExpansionKeys.includes(key)).map(({ key }) => key), requiredExpansionKeys);
  assert.ok(expanded.filter(({ key }) => requiredExpansionKeys.includes(key)).every(({ step }) => step === 2));
  assert.equal(expanded.find(({ key }) => key === "acceptsAccountControl")?.step, 2);
});

test("foreign-trade scenarios collect company age but never show CMB-only province", () => {
  for (const primaryBusinessModel of ["general_import_export", "processing_manufacturing", "wholesale_retail"]) {
    const keys = fieldKeys({ primaryBusinessModel, entityRegion: "mainland" });
    assert.ok(keys.includes("companyAgeMonths"), `${primaryBusinessModel} needs company age for customer-stage matching`);
    assert.ok(keys.includes("assetLiabilityRatioPercent"), `${primaryBusinessModel} needs asset-liability ratio for customer-stage matching`);
    assert.equal(keys.includes("registeredProvince"), false);
    assert.ok(keys.length <= 26, `${primaryBusinessModel} exceeds field budget`);
  }
  assert.ok(fieldKeys({ primaryBusinessModel: "tax_operations", entityRegion: "mainland" }).includes("registeredProvince"));
});

test("logistics intake exposes optional revenue, invoice and debt fields", () => {
  const fields = getVisibleIntakeFields({ primaryBusinessModel: "general_import_export" });
  const byKey = new Map(fields.map((field) => [field.key, field]));

  assert.equal(byKey.has("annualRevenueRmb"), true);
  assert.equal(byKey.has("taxInvoiceAmountRmb"), true);
  assert.equal(byKey.has("currentLoanBalanceRmb"), true);
  assert.equal(byKey.get("currentLoanBalanceRmb").requiredFor.length, 0);
});

test("progressive fields only expose the approved raw field contract", () => {
  const allowed = new Set([
    "companyName", "primaryBusinessModel", "preferredCurrency", "requestedAmount", "fundUse",
    "hasCurrentOverdue", "hasMaterialCreditOrJudicialNegative", "contactName", "phone", "consentToDataUse",
    "entityRegion", "entityType", "registeredProvince", "companyAgeMonths", "annualRevenueRmb",
    "assetLiabilityRatioPercent", "creditBankCount", "settlementAccountOpenedMonths",
    "settlementAccountFlowNormal", "applicantRole", "legalRepresentativeAge", "taxInvoiceAmountRmb",
    "supportsHighAmountAuthorization", "controllerIndustryExperienceYears", "industry",
    "hasSelfOperatedImportExportQualification", "importExportAmountLast12MonthsUsd",
    "importExportAmountMonths13To24Usd", "daysSinceLatestImportExport", "importExportCountLast12Months",
    "importExportRevenueSharePercent", "foreignExchangeClassification", "platformHistoryMonths", "platformSites",
    "storeCount", "singleStoreGmvUsd", "qualifiedStoreCount", "hasCompatibleCollectionAccount",
    "acceptsAccountControl", "includeWebankAssessment", "allStoreSalesRmb",
    "platformRepaymentsLast12MonthsRmb", "refundRatePercent", "amazonAhrScore", "amazonAccountStatus",
    "fbaInventoryTurnoverCount", "borrowerMatchesCollectionEntity", "participatingStoreOperatingDays",
    "amazonAnnualGmvUsd", "acceptsReceivablesArrangement", "accountsReceivableBalanceUsd", "buyerName",
    "buyerCountry", "buyerTradingHistoryMonths", "annualB2bTradeUsd", "currentLoanBalanceRmb",
  ]);

  for (const primaryBusinessModel of PRIMARY_BUSINESS_MODELS) {
    const keys = fieldKeys({ primaryBusinessModel, entityRegion: "mainland", includeWebankAssessment: true });
    assert.ok(keys.every((key) => allowed.has(key)), `${primaryBusinessModel} exposes an unapproved ${keys.find((key) => !allowed.has(key))}`);
  }
});

test("each progressive step validates its visible required fields", () => {
  const profile = { primaryBusinessModel: "amazon_sc" };
  assert.ok(validateIntakeStep(profile, "progressive", 1).some(({ key }) => key === "companyName"));
  assert.ok(validateIntakeStep(profile, "progressive", 2).some(({ key }) => key === "preferredCurrency"));
  assert.ok(validateIntakeStep(profile, "progressive", 3).some(({ key }) => key === "consentToDataUse"));
});

test("representative progressive journeys retain values and discard switched hidden fields", () => {
  const baseProfile = {
    companyName: "Example Co.",
    entityRegion: "mainland",
    entityType: "limited_company",
    preferredCurrency: "rmb",
    requestedAmount: 500000,
    fundUse: "inventory_procurement",
    hasCurrentOverdue: false,
    hasMaterialCreditOrJudicialNegative: false,
    contactName: "Jane Doe",
    phone: "13800138000",
    consentToDataUse: true,
  };
  const journeys = [
    "amazon_sc", "amazon_vc", "b2b_supermarket", "general_import_export", "tax_operations",
  ];

  for (const primaryBusinessModel of journeys) {
    const profile = { ...baseProfile, primaryBusinessModel };
    const fields = getVisibleIntakeFields(profile);
    const stageOne = fields.filter(({ step }) => step === 1);

    assert.ok(fields.length <= 26, `${primaryBusinessModel} exceeds desktop/mobile field budget`);
    assert.deepEqual([...new Set(fields.map(({ step }) => step))], [1, 2, 3]);
    assert.ok(INTAKE_STEPS.every(({ id }) => fields.some(({ step }) => step === id)), `${primaryBusinessModel} has an empty stage`);
    assert.deepEqual(validateIntakeStep(profile, "progressive", 1), []);
    assert.equal(stageOne.find(({ key }) => key === "companyName").key, "companyName");
    assert.equal(profile.companyName, "Example Co.");
  }

  const amazonScProfile = { ...baseProfile, primaryBusinessModel: "amazon_sc", singleStoreGmvUsd: 6000000 };
  const amazonVcFields = getVisibleIntakeFields({ ...amazonScProfile, primaryBusinessModel: "amazon_vc" });
  const amazonVcPayload = Object.fromEntries(
    amazonVcFields.map(({ key }) => [key, { ...amazonScProfile, primaryBusinessModel: "amazon_vc" }[key]]),
  );

  assert.equal(Object.hasOwn(amazonVcPayload, "singleStoreGmvUsd"), false);
  assert.equal(Object.hasOwn(amazonVcPayload, "amazonAnnualGmvUsd"), true);
});
