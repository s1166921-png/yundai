export const creditDimensions = [
  {
    key: "annualRevenue",
    label: "年营业收入",
    material: "财务报表、纳税申报表、完税证明",
    options: [
      { value: "revenue_500_1000", label: "500-1000 万", score: 3 },
      { value: "revenue_1000_3000", label: "1000-3000 万", score: 8 },
      { value: "revenue_3000_5000", label: "3000-5000 万", score: 13 },
      { value: "revenue_5000_10000", label: "5000 万-1 亿", score: 17 },
      { value: "revenue_10000_plus", label: "1 亿以上", score: 20 },
    ],
  },
  {
    key: "annualProfit",
    label: "年净利润",
    material: "审计报告、财务报表、完税证明",
    options: [
      { value: "profit_0_100", label: "0-100 万", score: 4 },
      { value: "profit_100_300", label: "100-300 万", score: 9 },
      { value: "profit_300_800", label: "300-800 万", score: 14 },
      { value: "profit_800_1500", label: "800-1500 万", score: 17 },
      { value: "profit_1500_plus", label: "1500 万以上", score: 20 },
    ],
  },
  {
    key: "businessStability",
    label: "业务稳定性",
    material: "前五大客户 / 供应商合同、上下游合作证明",
    options: [
      { value: "stability_new_concentrated", label: "前五大客户占比超 70%，合作不足 1 年", score: 3 },
      { value: "stability_1_2", label: "前五大客户占比 50%-70%，合作 1-2 年", score: 7 },
      { value: "stability_2_3", label: "前五大客户占比 30%-50%，合作 2-3 年", score: 11 },
      { value: "stability_3_plus", label: "前五大客户占比低于 30%，合作 3 年以上", score: 15 },
    ],
  },
  {
    key: "bankCredit",
    label: "现有银行授信情况",
    material: "公司银行授信情况附表、征信授权书",
    options: [
      { value: "credit_none", label: "无银行授信，白户", score: 2 },
      { value: "credit_1_low", label: "1 家银行合作，余额低于营收 30%", score: 6 },
      { value: "credit_2_mid", label: "2 家银行合作，余额占营收 30%-50%", score: 10 },
      { value: "credit_3_low", label: "3 家及以上合作，余额占营收低于 50%", score: 15 },
    ],
  },
  {
    key: "businessQualification",
    label: "企业资质软实力",
    material: "专利、行业认证证书、公司章程",
    options: [
      { value: "qualification_new", label: "无专利、无认证、成立不满 2 年", score: 2 },
      { value: "qualification_2_5", label: "成立 2-5 年，无核心资质", score: 6 },
      { value: "qualification_certified", label: "成立 5 年以上，有 1-2 项行业认证", score: 10 },
      { value: "qualification_leader", label: "有发明专利 / 高新资质，行业头部", score: 15 },
    ],
  },
  {
    key: "controllerAssets",
    label: "实控人家庭资产",
    material: "实控人家庭资产情况附表",
    options: [
      { value: "assets_under_100", label: "家庭净资产低于 100 万", score: 2 },
      { value: "assets_100_300", label: "家庭净资产 100-300 万", score: 6 },
      { value: "assets_300_800", label: "家庭净资产 300-800 万", score: 10 },
      { value: "assets_800_plus", label: "家庭净资产 800 万以上", score: 15 },
    ],
  },
];

export const debtRatioOptions = [
  { value: "no", label: "现有贷款余额不超过营收 70%" },
  { value: "yes", label: "现有贷款余额超过营收 70%（扣 10 分）" },
];

const bands = [
  { min: 0, max: 20, band: "50-100 万", audience: "初创小微客群", reference: 80 },
  { min: 21, max: 40, band: "100-300 万", audience: "主流标准客群", reference: 200 },
  { min: 41, max: 60, band: "300-800 万", audience: "优质中型企业", reference: 200 },
  { min: 61, max: 80, band: "800-1500 万", audience: "规模成长企业", reference: 600 },
  { min: 81, max: 100, band: "1500-2000 万", audience: "头部成熟企业", reference: 1800 },
];

const roundToTen = (amount) => Math.round(amount / 10) * 10;

function findBand(score) {
  return bands.find((item) => score >= item.min && score <= item.max) || bands[0];
}

export function calculateCreditEstimate(input) {
  const breakdown = creditDimensions.map((dimension) => {
    const selected = dimension.options.find((option) => option.value === input[dimension.key]);
    return {
      key: dimension.key,
      label: dimension.label,
      material: dimension.material,
      selection: selected?.label || "未选择",
      score: selected?.score || 0,
    };
  });
  const rawScore = breakdown.reduce((total, item) => total + item.score, 0);
  const debtPenalty = input.debtOverRevenue70 === "yes" ? 10 : 0;
  const score = Math.max(0, Math.min(100, rawScore - debtPenalty));
  const level = findBand(score);
  const referenceAmount = roundToTen(level.reference * (debtPenalty > 0 ? 0.8 : 1));

  return {
    score,
    rawScore,
    debtPenalty,
    band: level.band,
    audience: level.audience,
    referenceAmount,
    referenceAmountLabel: `${referenceAmount} 万元`,
    breakdown,
    summary: "已根据您提交的企业经营、财务和资质信息完成初步融资匹配。",
  };
}
