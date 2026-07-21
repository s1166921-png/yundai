export const simpleDimensions = [
  {
    key: "annualRevenue",
    label: "去年全年营业收入",
    options: [
      { value: "500-1000万", score: 1 },
      { value: "1000万-3000万", score: 3 },
      { value: "3000万-5000万", score: 6 },
      { value: "5000万-1亿", score: 10 },
      { value: "1亿以上", score: 15 },
    ],
  },
  {
    key: "annualProfit",
    label: "去年全年净利润",
    options: [
      { value: "0-100万", score: 2 },
      { value: "100-300万", score: 5 },
      { value: "300-1000万", score: 9 },
      { value: "1000万以上", score: 14 },
    ],
  },
  {
    key: "revenueGrowth",
    label: "今年营收增速",
    options: [
      { value: "0-10%", score: 1 },
      { value: "10%-30%", score: 4 },
      { value: "30-50%", score: 7 },
      { value: "50%以上", score: 12 },
    ],
  },
  {
    key: "employeeCount",
    label: "当前员工人数",
    options: [
      { value: "0-10人", score: 1 },
      { value: "10-20人", score: 3 },
      { value: "20-50人", score: 6 },
      { value: "50人以上", score: 9 },
    ],
  },
  {
    key: "bankCount",
    label: "贷款合作银行数",
    options: [
      { value: "0", score: 0 },
      { value: "1", score: 2 },
      { value: "2", score: 5 },
      { value: "3", score: 8 },
      { value: "3家以上", score: 12 },
    ],
  },
  {
    key: "desiredAmount",
    label: "本次融资意向",
    options: [
      { value: "50-100万", score: 1 },
      { value: "100-300万", score: 3 },
      { value: "300-500万", score: 6 },
      { value: "500万以上", score: 10 },
    ],
  },
];

function getBaseline(score) {
  if (score <= 20) return { band: "50-100 万", audience: "小微初创企业", referenceAmount: 80 };
  if (score <= 40) return { band: "100-300 万", audience: "主流标准客群", referenceAmount: 200 };
  if (score <= 60) return { band: "300-500 万", audience: "优质中型企业", referenceAmount: 420 };
  if (score <= 80) return { band: "500-1000 万", audience: "规模成长企业", referenceAmount: 750 };
  return { band: "1000-2000 万", audience: "大型成熟企业", referenceAmount: 1600 };
}

function getMatchedOutcome(score) {
  if (score >= 61) return { band: "1000-2000 万", audience: "大型成熟企业", referenceAmount: 1600, adjustment: "头部经营画像追加额度" };
  if (score >= 55) return { band: "500-1000 万", audience: "规模成长企业", referenceAmount: 750, adjustment: "成长性与现金流匹配上浮" };
  if (score >= 35) return { band: "300-500 万", audience: "优质中型企业", referenceAmount: 420, adjustment: "成长性经营画像匹配上浮" };
  if (score >= 21) return { band: "100-300 万", audience: "主流标准客群", referenceAmount: 260, adjustment: "经营指标综合匹配" };
  if (score === 20) return { band: "100-300 万", audience: "主流标准客群", referenceAmount: 200, adjustment: "经营稳定性匹配上浮" };
  if (score >= 11) return { band: "100-300 万", audience: "新企业成长客群", referenceAmount: 130, adjustment: "基础经营信息初步匹配" };
  return { ...getBaseline(score), adjustment: "基础评分结果" };
}

export function calculateSimpleEstimate(input) {
  const breakdown = simpleDimensions.map((dimension) => {
    const selected = dimension.options.find((option) => option.value === input[dimension.key]);
    return {
      key: dimension.key,
      label: dimension.label,
      selection: selected?.value || "未选择",
      score: selected?.score || 0,
    };
  });
  const score = breakdown.reduce((total, item) => total + item.score, 0);
  const outcome = getMatchedOutcome(score);

  return {
    mode: "simple",
    score,
    rawScore: score,
    debtPenalty: 0,
    breakdown,
    ...outcome,
    referenceAmountLabel: `${outcome.referenceAmount} 万元`,
    summary: "已根据您提交的基础经营信息完成初步融资匹配。",
  };
}
