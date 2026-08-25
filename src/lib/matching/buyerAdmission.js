export const BUYER_ADMISSION_VERSION = "2026-08-25";

const normalize = (value) => typeof value === "string"
  ? value.normalize("NFKC").trim().toLowerCase().replace(/[.,/_-]/g, " ").replace(/\s+/g, " ").trim()
  : "";

const ADMITTED_BUYERS = new Set([
  "walmart",
  "wal mart",
  "walmart inc",
  "walmart stores",
  "沃尔玛",
  "沃尔玛超市",
  "home depot",
  "the home depot",
  "home depot inc",
  "the home depot inc",
  "家得宝",
  "家得寶",
  "target",
  "target corporation",
  "target corp",
  "塔吉特",
  "costco",
  "costco wholesale",
  "costco wholesale corporation",
  "开市客",
  "開市客",
  "好市多",
  "chewy",
  "chewy inc",
  "chewy 宠物",
  "chewy 宠物用品",
  "chewy宠物",
  "chewy宠物用品",
  "丘伊",
]);

const ADMITTED_COUNTRIES = new Set([
  "austria", "奥地利",
  "belgium", "比利时",
  "croatia", "克罗地亚",
  "denmark", "丹麦",
  "england", "英格兰",
  "wales", "威尔士",
  "finland", "芬兰",
  "france", "法国",
  "germany", "德国",
  "italy", "意大利",
  "luxembourg", "卢森堡",
  "netherlands", "the netherlands", "holland", "荷兰",
  "northern ireland", "北爱尔兰",
  "norway", "挪威",
  "poland", "波兰",
  "portugal", "葡萄牙",
  "republic of ireland", "ireland", "eire", "爱尔兰", "爱尔兰共和国",
  "scotland", "苏格兰",
  "spain", "西班牙",
  "sweden", "瑞典",
  "switzerland", "瑞士",
  "canada", "加拿大",
  "美国",
  "united states",
  "united states of america",
  "us",
  "usa",
  "u s",
  "u s a",
  "brazil", "巴西",
  "argentina", "阿根廷",
  "chile", "智利",
  "australia", "澳大利亚",
  "new zealand", "新西兰",
  "israel", "以色列",
  "china", "mainland china", "people s republic of china", "中国", "中国大陆",
  "hong kong", "hong kong sar", "hong kong china", "香港",
  "taiwan", "taiwan china", "台湾",
  "india", "印度",
  "singapore", "新加坡",
  "japan", "日本",
  "south korea", "republic of korea", "korea republic of", "韩国", "南韩",
]);

export function deriveBuyerAdmission({ buyerName, buyerCountry } = {}) {
  const normalizedBuyer = normalize(buyerName);
  const normalizedCountry = normalize(buyerCountry);

  return {
    buyerPlatformType: ADMITTED_BUYERS.has(normalizedBuyer) ? "admitted_1p_retailer" : "other",
    buyerCountryEligibility: ADMITTED_COUNTRIES.has(normalizedCountry)
      ? "confirmed_admitted"
      : normalizedCountry ? "needs_review" : null,
  };
}
