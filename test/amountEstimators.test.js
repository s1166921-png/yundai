import test from "node:test";
import assert from "node:assert/strict";
import { estimateAmount } from "../src/lib/matching/amountEstimators.js";

test("Ping An logistics applies industry coefficient and 5m RMB cap", () => {
  const estimate = estimateAmount({ amountEstimator: "pingan_logistics" }, {
    industry: "processing_manufacturing",
    annualRevenue: { amount: 40000000, currency: "RMB" },
    taxInvoiceAmount: { amount: 3000000, currency: "RMB" },
  });

  assert.deepEqual(estimate, {
    kind: "exact", currency: "RMB", min: 5000000, max: 5000000,
    formulaKey: "pingan_logistics_v1", note: "制造业按营收16%与税票核额综合判断，受500万元上限约束",
  });
});

test("WeBank returns a collection-based range", () => {
  const estimate = estimateAmount({ amountEstimator: "webank_collections" }, {
    collectionsLast12Months: { amount: 12000000, currency: "RMB" },
  });

  assert.deepEqual(estimate, {
    kind: "range", currency: "RMB", min: 1000000, max: 3500000,
    formulaKey: "webank_collections_v1", note: "按近12个月月均回款的1至3.5倍测算，最终倍数由机构综合评级确定",
  });
});

test("Ping An Orange provides the documented RMB range", () => {
  assert.deepEqual(estimateAmount({ amountEstimator: "pingan_orange" }, {}), {
    kind: "range", currency: "RMB", min: 50001, max: 3000000,
    formulaKey: "pingan_orange_v1", note: "资料未提供税金到额度的精确核额公式。",
  });
});

test("CMB leaves the amount manual when its coefficients are unavailable", () => {
  assert.deepEqual(estimateAmount({ amountEstimator: "cmb" }, {
    annualRevenue: { amount: 50000000, currency: "RMB" },
  }), {
    kind: "manual", currency: "RMB", min: null, max: null,
    formulaKey: "cmb_manual_v1", note: "资料未提供基础系数和附加系数具体取值，需客户经理补充系数。",
  });
});

test("Ping An logistics uses the higher supported RMB basis without conversion", () => {
  assert.deepEqual(estimateAmount({ amountEstimator: "pingan_logistics" }, {
    industry: "wholesale_retail",
    annualRevenue: { amount: 10000000, currency: "RMB" },
    taxInvoiceAmount: { amount: 3000000, currency: "RMB" },
  }), {
    kind: "exact", currency: "RMB", min: 3000000, max: 3000000,
    formulaKey: "pingan_logistics_v1", note: "批发零售按营收10%与税票核额综合判断，受500万元上限约束",
  });
});

test("formula estimators stay manual for missing or mismatched currency inputs", () => {
  assert.deepEqual(estimateAmount({ amountEstimator: "pingan_logistics" }, {
    industry: "processing_manufacturing",
    annualRevenue: { amount: 40000000, currency: "USD" },
    taxInvoiceAmount: { amount: 3000000, currency: "RMB" },
  }), {
    kind: "manual", currency: "RMB", min: null, max: null,
    formulaKey: "pingan_logistics_v1", note: "需补充人民币年营收、税票核额和所属行业后测算额度。",
  });

  assert.deepEqual(estimateAmount({ amountEstimator: "webank_collections" }, {}), {
    kind: "manual", currency: "RMB", min: null, max: null,
    formulaKey: "webank_collections_v1", note: "需补充近12个月人民币回款后测算额度。",
  });
});

test("WeBank caps both ends of the reference range at 20m RMB", () => {
  assert.deepEqual(estimateAmount({ amountEstimator: "webank_collections" }, {
    collectionsLast12Months: { amount: 120000000, currency: "RMB" },
  }), {
    kind: "range", currency: "RMB", min: 10000000, max: 20000000,
    formulaKey: "webank_collections_v1", note: "按近12个月月均回款的1至3.5倍测算，最终倍数由机构综合评级确定",
  });
});

test("Linklogis SC scales its USD range by qualified stores", () => {
  assert.deepEqual(estimateAmount({ amountEstimator: "linklogis_sc" }, {
    qualifiedStoreCount: 2,
  }), {
    kind: "range", currency: "USD", min: 0, max: 6000000,
    formulaKey: "linklogis_sc_v1", note: "单店最高300万美元，最终额度以机构评估为准。",
  });
});

test("Linklogis SC requires a positive qualified-store count before showing a USD range", () => {
  for (const qualifiedStoreCount of [null, 0]) {
    const estimate = estimateAmount({ amountEstimator: "linklogis_sc" }, { qualifiedStoreCount });
    assert.equal(estimate.kind, "manual");
    assert.equal(estimate.min, null);
    assert.equal(estimate.max, null);
  }

  assert.deepEqual(estimateAmount({ amountEstimator: "linklogis_sc" }, { qualifiedStoreCount: 1 }), {
    kind: "range", currency: "USD", min: 0, max: 3000000,
    formulaKey: "linklogis_sc_v1", note: "单店最高300万美元，最终额度以机构评估为准。",
  });
});

test("Linklogis VC and B2B remain manual without fixed USD caps", () => {
  assert.deepEqual(estimateAmount({ amountEstimator: "linklogis_vc" }, {
    accountsReceivableBalance: { amount: 900000, currency: "USD" },
  }), {
    kind: "manual", currency: "USD", min: null, max: null,
    formulaKey: "linklogis_vc_v1", note: "按可融资应收账款评估，额度不设固定上限。",
  });

  assert.deepEqual(estimateAmount({ amountEstimator: "linklogis_b2b" }, {
    accountsReceivableBalance: { amount: 900000, currency: "USD" },
  }), {
    kind: "manual", currency: "USD", min: null, max: null,
    formulaKey: "linklogis_b2b_v1", note: "按买方应收账款评估，额度不设固定上限。",
  });
});
