import test from "node:test";
import assert from "node:assert/strict";
import { PRODUCT_CATALOG, PRODUCT_IDS, getProductById } from "../src/lib/matching/productCatalog.js";
import { normalizeCustomerProfile } from "../src/lib/matching/customerProfile.js";

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
  }
  assert.equal(getProductById("linklogis-amazon-sc").currency, "USD");
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
