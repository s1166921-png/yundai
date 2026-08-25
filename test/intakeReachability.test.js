import test from "node:test";
import assert from "node:assert/strict";
import { normalizeCustomerProfile, validateCustomerProfile } from "../src/lib/matching/customerProfile.js";
import { INTAKE_STEPS, getVisibleIntakeFields, validateIntakeStep } from "../src/lib/matching/intakeSchema.js";

const requiredValueFor = (field, primaryBusinessModel) => {
  if (field.key === "primaryBusinessModel") return primaryBusinessModel;
  if (field.key === "companyName") return "Synthetic Progressive Co.";
  if (field.key === "contactName") return "Synthetic Contact";
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

const journey = (primaryBusinessModel) => {
  let profile = { intakeVersion: "progressive-v1", primaryBusinessModel };
  const visitedStages = [];

  for (const { id } of INTAKE_STEPS) {
    for (const field of getVisibleIntakeFields(profile).filter((field) => field.step === id && field.requiredFor.length > 0)) {
      profile = { ...profile, [field.key]: requiredValueFor(field, primaryBusinessModel) };
    }
    assert.deepEqual(validateIntakeStep(profile, "progressive", id), [], `${primaryBusinessModel} step ${id}`);
    visitedStages.push({ profile: structuredClone(profile), keys: getVisibleIntakeFields(profile).map(({ key }) => key) });
  }

  const normalized = normalizeCustomerProfile(visiblePayload(profile));
  assert.deepEqual(validateCustomerProfile(normalized, "progressive").errors, []);
  assert.equal(normalized.intakeVersion, "progressive-v1");
  assert.deepEqual(INTAKE_STEPS.flatMap(({ id }) => validateIntakeStep(profile, "progressive", id)), []);
  assert.ok(getVisibleIntakeFields(profile).length <= 23, `${primaryBusinessModel} exceeds the standard budget`);
  assert.equal(profile.companyName, visitedStages[0].profile.companyName, `${primaryBusinessModel} retains step-one state after back navigation`);
  assert.deepEqual(validateIntakeStep(profile, "progressive", 1), []);
  assert.equal(visitedStages[0].profile.companyName, "Synthetic Progressive Co.");
  assert.ok(visitedStages.every(({ keys }) => keys.length > 0), `${primaryBusinessModel} has an empty stage`);

  return profile;
};

test("five representative progressive customer journeys validate one stage at a time", () => {
  for (const primaryBusinessModel of [
    "amazon_sc", "amazon_vc", "b2b_supermarket", "general_import_export", "tax_operations",
  ]) {
    journey(primaryBusinessModel);
  }
});

test("scenario switching keeps retained state while excluding hidden values from submission", () => {
  const amazonSc = {
    ...journey("amazon_sc"),
    singleStoreGmvUsd: 6000000,
    includeWebankAssessment: true,
    amazonAhrScore: 95,
  };
  const switched = { ...amazonSc, primaryBusinessModel: "amazon_vc" };
  const payload = visiblePayload(switched);

  assert.equal(amazonSc.companyName, switched.companyName);
  assert.equal(Object.hasOwn(payload, "singleStoreGmvUsd"), false);
  assert.equal(Object.hasOwn(payload, "amazonAhrScore"), false);
  assert.equal(Object.hasOwn(payload, "amazonAnnualGmvUsd"), false);
  assert.equal(normalizeCustomerProfile(payload).primaryBusinessModel, "amazon_vc");
});
