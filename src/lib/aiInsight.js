const simpleDocuments = [
  "近一年财务报表或纳税申报摘要",
  "近 3 个月经营流水或平台回款记录",
  "主营业务及本次资金用途说明",
];

export { buildCustomerMatchReport } from "./matching/reportBuilder.js";

const complexDocuments = [
  "近三年财务报表、纳税申报表或完税证明",
  "前五大客户/供应商合作证明与核心合同",
  "现有银行授信情况及征信授权材料",
  "企业资质、专利或行业认证证明",
];

function has(value, fragments) {
  return fragments.some((fragment) => String(value || "").includes(fragment));
}

function stageFor(estimate) {
  if (estimate.referenceAmount >= 1000) return "成熟扩张型";
  if (estimate.referenceAmount >= 300) return "稳健成长型";
  if (estimate.referenceAmount >= 100) return "经营起步型";
  return "初创发展型";
}

export function createAiInsight(input, estimate, mode = estimate.mode || "complex") {
  const stage = stageFor(estimate);
  const priority = estimate.referenceAmount >= 300 || has(input.desiredAmount, ["300", "500"])
    ? "优先跟进"
    : estimate.referenceAmount >= 100 ? "建议跟进" : "培育跟进";
  const strengths = [];

  if (has(input.annualRevenue, ["3000", "5000", "1亿"])) strengths.push("企业营收规模已形成较好的经营基础");
  if (has(input.annualProfit, ["300", "800", "1000", "1500"])) strengths.push("盈利表现可作为经营还款能力的重要参考");
  if (mode === "simple" && has(input.revenueGrowth, ["30", "50"])) strengths.push("营收增长趋势为经营扩张提供了积极信号");
  if (mode === "complex" && has(input.businessStability, ["2-3", "3 年", "低于 30"])) strengths.push("上下游合作关系具有一定稳定性");
  if (mode === "complex" && has(input.businessQualification, ["认证", "专利", "高新"])) strengths.push("企业资质可增强经营韧性与资料完整度");
  if (!strengths.length) strengths.push("已具备基础经营信息，可进入融资准备梳理阶段");

  const gaps = mode === "simple"
    ? ["补充近 3 个月流水或平台回款，可进一步判断周转节奏", ...(input.bankCount === "0" ? ["如暂无银行合作记录，建议提前准备基础经营证明材料"] : [])]
    : [
      ...(input.debtOverRevenue70 === "yes" ? ["现有负债占比较高，建议优先整理还款计划与资金用途说明"] : []),
      "完整征信、流水与合同材料仍需由后续审批环节核验",
    ];

  const direction = input.productInterest === "货押贷"
    ? "建议优先围绕备货、仓储与物流费用规划资金安排"
    : input.productInterest === "应收贷"
      ? "建议优先围绕平台回款周期与经营周转安排资金计划"
      : "建议先明确经营周转节点，再匹配合适的融资使用方案";

  return {
    profile: `${stage}企业画像`,
    priority,
    headline: `AI 已完成经营信息梳理，当前更接近${stage}的融资准备状态。`,
    financingDirection: direction,
    strengths: strengths.slice(0, 3),
    gaps: gaps.slice(0, 2),
    documents: mode === "complex" ? complexDocuments : simpleDocuments,
    nextStep: priority === "优先跟进"
      ? "建议优先由融资顾问沟通资金用途、回款周期与资料准备节奏。"
      : "建议补充核心经营材料后，由融资顾问进一步确认匹配方向。",
  };
}
