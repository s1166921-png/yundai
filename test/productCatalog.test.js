import test from "node:test";
import assert from "node:assert/strict";
import { PRODUCT_CATALOG, PRODUCT_IDS, getProductById } from "../src/lib/matching/productCatalog.js";

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
