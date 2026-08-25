import test from "node:test";
import assert from "node:assert/strict";
import { matchProducts } from "../src/lib/matching/productMatcher.js";
import { buildCustomerMatchReport } from "../src/lib/matching/reportBuilder.js";
import { buildProductMatchView } from "../src/lib/productMatchView.js";
import { normalizeCustomerProfile } from "../src/lib/matching/customerProfile.js";
import { getPublicProducts } from "../src/lib/matching/publicProductProjection.js";

const progressive = (profile) => normalizeCustomerProfile({
  intakeVersion: "progressive-v1",
  hasCurrentOverdue: false,
  hasMaterialCreditOrJudicialNegative: false,
  consentToDataUse: true,
  ...profile,
});

const amazonScProfile = () => progressive({
  primaryBusinessModel: "amazon_sc",
  entityRegion: "mainland",
  entityType: "limited_company",
  platformHistoryMonths: 13,
  singleStoreGmvUsd: 6000000,
  qualifiedStoreCount: 1,
  acceptsAccountControl: true,
  preferredCurrency: "usd",
  requestedAmount: 2000000,
  fundUse: "inventory_procurement",
});

const amazonScWithWebankExpansion = () => progressive({
  primaryBusinessModel: "amazon_sc",
  entityRegion: "mainland",
  entityType: "limited_company",
  companyAgeMonths: 24,
  legalRepresentativeAge: 38,
  platformHistoryMonths: 30,
  platformSites: ["united_states"],
  singleStoreGmvUsd: 6000000,
  qualifiedStoreCount: 1,
  storeCount: 2,
  allStoreSalesRmb: 24000000,
  platformRepaymentsLast12MonthsRmb: 9000000,
  refundRatePercent: 12,
  amazonAhrScore: 320,
  amazonAccountStatus: "normal",
  fbaInventoryTurnoverCount: 3,
  borrowerMatchesCollectionEntity: true,
  participatingStoreOperatingDays: 365,
  acceptsAccountControl: true,
  preferredCurrency: "rmb",
  requestedAmount: 1000000,
  fundUse: "platform_operations",
});

const amazonVcProfile = () => progressive({
  primaryBusinessModel: "amazon_vc",
  entityRegion: "mainland",
  entityType: "limited_company",
  platformSites: ["united_states"],
  amazonAnnualGmvUsd: 3000000,
  platformHistoryMonths: 12,
  acceptsReceivablesArrangement: true,
  acceptsAccountControl: true,
  preferredCurrency: "usd",
  requestedAmount: 1000000,
  fundUse: "receivables_turnover",
});

const b2bCostcoProfile = () => progressive({
  primaryBusinessModel: "b2b_supermarket",
  entityRegion: "mainland",
  entityType: "limited_company",
  buyerName: "Costco",
  buyerCountry: "美国",
  buyerTradingHistoryMonths: 24,
  annualB2bTradeUsd: 5000000,
  acceptsReceivablesArrangement: true,
  acceptsAccountControl: true,
  preferredCurrency: "usd",
  requestedAmount: 1000000,
  fundUse: "receivables_turnover",
});

const foreignTradeProfile = () => progressive({
  primaryBusinessModel: "general_import_export",
  entityRegion: "mainland",
  entityType: "limited_company",
  industry: "加工制造",
  companyAgeMonths: 60,
  controllerIndustryExperienceYears: 8,
  hasSelfOperatedImportExportQualification: true,
  importExportAmountLast12MonthsUsd: 1000000,
  importExportAmountMonths13To24Usd: 900000,
  daysSinceLatestImportExport: 30,
  importExportCountLast12Months: 8,
  importExportRevenueSharePercent: 60,
  foreignExchangeClassification: "a",
  assetLiabilityRatioPercent: 60,
  annualRevenueRmb: 40000000,
  taxInvoiceAmountRmb: 3000000,
  preferredCurrency: "rmb",
  requestedAmount: 3000000,
  fundUse: "logistics_working_capital",
});

const guangdongTaxProfile = () => progressive({
  primaryBusinessModel: "tax_operations",
  registeredProvince: "广东省",
  companyAgeMonths: 60,
  annualRevenueRmb: 12000000,
  assetLiabilityRatioPercent: 50,
  creditBankCount: 2,
  settlementAccountOpenedMonths: 24,
  settlementAccountFlowNormal: true,
  applicantRole: "法人",
  legalRepresentativeAge: 40,
  taxInvoiceAmountRmb: 5000000,
  preferredCurrency: "rmb",
  requestedAmount: 400000,
  fundUse: "tax_business_operations",
});

const nonGuangdongTaxProfile = () => progressive({
  primaryBusinessModel: "tax_operations",
  registeredProvince: "浙江省",
  companyAgeMonths: 36,
  applicantRole: "法人",
  legalRepresentativeAge: 40,
  taxInvoiceAmountRmb: 5000000,
  preferredCurrency: "rmb",
  requestedAmount: 400000,
  fundUse: "tax_business_operations",
});

const REPRESENTATIVE_PROFILES = Object.freeze([
  [amazonScProfile, "linklogis-amazon-sc"],
  [amazonScWithWebankExpansion, "webank-cross-border-data-loan"],
  [amazonVcProfile, "linklogis-amazon-vc"],
  [b2bCostcoProfile, "linklogis-b2b-factoring"],
  [foreignTradeProfile, "pingan-foreign-trade-logistics-loan"],
  [guangdongTaxProfile, "cmb-guangdong-business-loan"],
  [nonGuangdongTaxProfile, "pingan-orange-tax-loan"],
]);

test("seven progressive scenarios each lead with their intended product direction", () => {
  for (const [createProfile, expectedProductId] of REPRESENTATIVE_PROFILES) {
    const primary = matchProducts(createProfile()).find(({ rank }) => rank === 1);
    assert.equal(primary?.productId, expectedProductId);
  }
});

test("core scenario boundaries deterministically remove their product direction", () => {
  const sc = matchProducts({ ...amazonScProfile(), singleStoreGmv: { amount: 5000000, currency: "USD" } })
    .find(({ productId }) => productId === "linklogis-amazon-sc");
  const vc = matchProducts({ ...amazonVcProfile(), platformSites: ["other"] })
    .find(({ productId }) => productId === "linklogis-amazon-vc");
  const b2b = matchProducts({ ...b2bCostcoProfile(), buyerTradingHistoryMonths: 12 })
    .find(({ productId }) => productId === "linklogis-b2b-factoring");

  assert.equal(sc.status, "ineligible");
  assert.equal(sc.rank, null);
  assert.equal(vc.status, "ineligible");
  assert.equal(vc.rank, null);
  assert.equal(b2b.status, "ineligible");
  assert.equal(b2b.rank, null);
});

test("progressive matcher to report to view journeys keep seven directions customer-safe", () => {
  for (const [createProfile, expectedProductId] of REPRESENTATIVE_PROFILES) {
    const profile = createProfile();
    const matches = matchProducts(profile, { intakeVersion: profile.intakeVersion });
    const report = buildCustomerMatchReport(profile, matches);
    const view = buildProductMatchView(report, getPublicProducts());
    const serialized = JSON.stringify(view);

    assert.equal(matches.find(({ rank }) => rank === 1)?.productId, expectedProductId);
    assert.ok(matches.filter(({ rank }) => rank != null).length <= 3);
    assert.ok(report.alternatives.length <= 2);
    assert.ok(["优先产品方向", "待补关键信息"].includes(report.primary?.presentationLabel));
    assert.equal(report.disclaimer, "仍需资金方及融资顾问核验完整资料，本结果不构成授信或放款承诺。");
    assert.equal(view.disclaimer, report.disclaimer);
    assert.doesNotMatch(serialized, /fitScore|confidence|failedRules|internalBankRating|advisorVerificationFields|formulaKey/);
  }
});

test("estimator-only omissions suppress the numeric amount without demoting the SC direction", () => {
  const profile = amazonScProfile();
  profile.qualifiedStoreCount = null;
  const matches = matchProducts(profile);
  const report = buildCustomerMatchReport(profile, matches);

  assert.equal(matches.find(({ productId }) => productId === "linklogis-amazon-sc")?.status, "eligible");
  assert.equal(report.primary?.presentationLabel, "优先产品方向");
  assert.equal(report.primary?.estimatedAmount, null);
});
