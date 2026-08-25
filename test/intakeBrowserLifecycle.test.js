import test from "node:test";
import assert from "node:assert/strict";
import { normalizeCustomerProfile } from "../src/lib/matching/customerProfile.js";
import { INTAKE_STEPS, getVisibleIntakeFields, validateIntakeStep } from "../src/lib/matching/intakeSchema.js";

const submissionPayload = (profile) => ({
  intakeVersion: "progressive-v1",
  ...Object.fromEntries(getVisibleIntakeFields(profile)
    .filter(({ key }) => profile[key] != null && profile[key] !== "")
    .map(({ key }) => [key, profile[key]])),
});

test("progressive submission retains active values and excludes stale scenario fields", () => {
  const amazonSc = {
    intakeVersion: "progressive-v1",
    companyName: "Lifecycle Co.",
    primaryBusinessModel: "amazon_sc",
    entityRegion: "mainland",
    entityType: "limited_company",
    preferredCurrency: "usd",
    requestedAmount: 1000000,
    fundUse: "inventory_procurement",
    hasCurrentOverdue: false,
    hasMaterialCreditOrJudicialNegative: false,
    contactName: "Lifecycle User",
    phone: "13800138000",
    consentToDataUse: true,
    singleStoreGmvUsd: 6000000,
    includeWebankAssessment: true,
    amazonAhrScore: 95,
  };

  assert.deepEqual(INTAKE_STEPS.flatMap(({ id }) => validateIntakeStep(amazonSc, "progressive", id)), []);

  const amazonVc = { ...amazonSc, primaryBusinessModel: "amazon_vc" };
  const payload = submissionPayload(amazonVc);
  const normalized = normalizeCustomerProfile(payload);

  assert.equal(payload.companyName, "Lifecycle Co.");
  assert.equal(Object.hasOwn(payload, "singleStoreGmvUsd"), false);
  assert.equal(Object.hasOwn(payload, "amazonAhrScore"), false);
  assert.equal(normalized.intakeVersion, "progressive-v1");
  assert.equal(normalized.primaryBusinessModel, "amazon_vc");
  assert.deepEqual(normalized.businessModels, ["amazon_vc"]);
});
