import test from "node:test";
import assert from "node:assert/strict";
import { PRODUCT_CATALOG, PRODUCT_IDS, RULE_COLLECTION_STAGES, getProductById } from "../src/lib/matching/productCatalog.js";
import { normalizeCustomerProfile } from "../src/lib/matching/customerProfile.js";
import { ruleDependencyFields } from "../src/lib/matching/ruleEvaluator.js";
import { getPublicProducts } from "../src/lib/matching/publicProductProjection.js";

function configuredProfilePaths(rule) {
  const paths = [rule.field];
  for (const [key, value] of Object.entries(rule.value ?? {})) {
    if (key.endsWith("Field") && typeof value === "string") paths.push(value);
    if (["fields", "requiresAllTruthy"].includes(key) && Array.isArray(value)) {
      for (const item of value) paths.push(typeof item === "string" ? item : item.field);
    }
  }
  return paths.filter(Boolean);
}

test("catalog exposes all seven unique, versioned products", () => {
  assert.deepEqual(PRODUCT_IDS, [
    "cmb-guangdong-business-loan",
    "pingan-orange-tax-loan",
    "pingan-foreign-trade-logistics-loan",
    "webank-cross-border-data-loan",
    "linklogis-amazon-sc",
    "linklogis-amazon-vc",
    "linklogis-b2b-factoring",
  ]);
  assert.equal(new Set(PRODUCT_CATALOG.map((product) => product.id)).size, 7);
  for (const product of PRODUCT_CATALOG) {
    assert.match(product.version, /^2026-\d{2}-\d{2}$/);
    assert.ok(product.source.length > 0);
    assert.ok(product.ruleSet.length > 0);
    assert.deepEqual(Object.keys(product.customerScenario).sort(), ["id", "label", "order"]);
    assert.equal(typeof product.customerTargetProfile, "string");
    assert.ok(product.customerTargetProfile.length > 0);
    assert.equal(typeof product.customerPrerequisite, "string");
    assert.ok(product.customerPrerequisite.length > 0);
    assert.deepEqual(Object.keys(product.fitProfile).sort(), [
      "businessModels",
      "cashFlowFields",
      "controlGroups",
      "purposes",
      "repaymentMethods",
      "scaleRuleIds",
    ]);
    assert.doesNotMatch(product.customerTargetProfile, /。；/);
  }
  assert.equal(getProductById("linklogis-amazon-sc").currency, "USD");
});

test("catalog models sourced VC GMV, WeBank negatives, SC exemption, and canonical buyer review semantics", () => {
  const webank = getProductById("webank-cross-border-data-loan");
  const sc = getProductById("linklogis-amazon-sc");
  const vc = getProductById("linklogis-amazon-vc");
  const b2b = getProductById("linklogis-b2b-factoring");

  assert.equal(
    webank.ruleSet.find((rule) => rule.id === "no-material-credit-or-judicial-issues").field,
    "hasMaterialCreditOrJudicialNegative",
  );
  assert.equal(sc.ruleSet.find((rule) => rule.id === "collection-account-arrangement").value.evaluator, "anyTruthy");
  assert.equal(vc.ruleSet.find((rule) => rule.id === "amazon-annual-gmv").field, "amazonAnnualGmv.amount");
  assert.equal(b2b.ruleSet.find((rule) => rule.id === "eligible-buyer").value.evaluator, "buyerEligibility");
  assert.doesNotMatch(JSON.stringify(b2b.ruleSet), /准入 1P 商超|已列明准入国家/);
});

test("every product rule declares a valid collection stage", () => {
  for (const product of PRODUCT_CATALOG) {
    for (const rule of product.ruleSet) {
      assert.ok(RULE_COLLECTION_STAGES.includes(rule.collectionStage), `${product.id}/${rule.id}`);
    }
  }
});

test("catalog custom-rule dependencies are complete and unique", () => {
  for (const product of PRODUCT_CATALOG) {
    for (const rule of product.ruleSet.filter(({ operator }) => operator === "custom")) {
      const fields = ruleDependencyFields(rule);
      assert.equal(new Set(fields).size, fields.length, `${product.id}/${rule.id}`);
      assert.ok(fields.includes(rule.field), `${product.id}/${rule.id}`);
    }
  }
});

test("every catalog and custom-evaluator input uses a canonical customer profile field", () => {
  const canonicalFields = new Set(Object.keys(normalizeCustomerProfile({})));
  const configuredPaths = PRODUCT_CATALOG.flatMap((product) => (
    product.ruleSet.flatMap(configuredProfilePaths)
  ));

  assert.deepEqual(configuredPaths.filter((field) => field.startsWith("raw.")), []);
  assert.deepEqual(
    configuredPaths.filter((field) => !canonicalFields.has(field.split(".")[0])),
    [],
  );
});

test("tax-loan supplementary authorizations apply as hard requirements from 500,000 RMB", () => {
  const taxLoan = getProductById("pingan-orange-tax-loan");
  const authorizationRule = taxLoan.ruleSet.find((rule) => rule.id === "additional-authorizations-over-500k");

  assert.equal(authorizationRule.severity, "hard");
  assert.equal(authorizationRule.value.whenAtLeast, 500000);
  assert.deepEqual(authorizationRule.value.requiresAllTruthy, [
    "spouseCreditAuthorization",
    "controllerCreditAuthorization",
    "applicableGuarantee",
  ]);
});

test("public risk messages are neutral while sensitive reasons remain internal", () => {
  const cmbLoan = getProductById("cmb-guangdong-business-loan");
  const sensitiveRules = cmbLoan.ruleSet
    .filter((rule) => ["no-aml-blacklist", "no-overdue-principal-or-interest"].includes(rule.id));

  assert.deepEqual(sensitiveRules.map((rule) => rule.message), [
    "请完成企业合规状态核验。",
    "请补充并核验企业还款状态。",
  ]);
  assert.deepEqual(sensitiveRules.map((rule) => rule.internalReason), [
    "反洗钱黑名单",
    "逾期欠息",
  ]);
});

test("rule values are immutable", () => {
  const cmbLoan = getProductById("cmb-guangdong-business-loan");
  const companyAgeRule = cmbLoan.ruleSet.find((rule) => rule.id === "company-age-and-rating");

  assert.ok(Object.isFrozen(companyAgeRule.value));
  assert.throws(() => {
    companyAgeRule.value.minimumMonths = 61;
  }, TypeError);
  assert.equal(companyAgeRule.value.minimumMonths, 60);
});

test("public product projection preserves normalized target-profile punctuation", () => {
  for (const product of getPublicProducts()) {
    assert.doesNotMatch(product.targetProfile, /。；/);
    assert.equal(product.targetProfile, getProductById(product.id).customerTargetProfile);
  }
});
