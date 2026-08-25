import test from "node:test";
import assert from "node:assert/strict";
import { createAiInsight } from "../src/lib/aiInsight.js";

test("legacy AI insight remains available for complex estimates", () => {
  const insight = createAiInsight({
    desiredAmount: "500万",
    annualRevenue: "5000万",
    annualProfit: "800万",
    businessStability: "合作 3 年",
    businessQualification: "高新认证",
    debtOverRevenue70: "no",
  }, {
    mode: "complex",
    referenceAmount: 500,
  });

  assert.equal(insight.priority, "优先跟进");
  assert.equal(insight.profile, "稳健成长型企业画像");
  assert.ok(insight.strengths.length > 0);
  assert.ok(insight.documents.length > 0);
});
