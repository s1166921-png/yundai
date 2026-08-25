import test from "node:test";
import assert from "node:assert/strict";
import { BUYER_ADMISSION_VERSION, deriveBuyerAdmission } from "../src/lib/matching/buyerAdmission.js";

test("derives admitted buyer and country facts from normalized customer text", () => {
  assert.equal(BUYER_ADMISSION_VERSION, "2026-08-25");
  assert.deepEqual(deriveBuyerAdmission({ buyerName: "  Costco Wholesale ", buyerCountry: "美国" }), {
    buyerPlatformType: "admitted_1p_retailer",
    buyerCountryEligibility: "confirmed_admitted",
  });
  assert.deepEqual(deriveBuyerAdmission({ buyerName: "THE HOME DEPOT, INC.", buyerCountry: "United States" }), {
    buyerPlatformType: "admitted_1p_retailer",
    buyerCountryEligibility: "confirmed_admitted",
  });
});

test("admits every supplied country and region through English and Chinese aliases", () => {
  const countries = [
    ["Austria", "奥地利"], ["Belgium", "比利时"], ["Croatia", "克罗地亚"], ["Denmark", "丹麦"],
    ["England", "英格兰"], ["Wales", "威尔士"], ["Finland", "芬兰"], ["France", "法国"],
    ["Germany", "德国"], ["Italy", "意大利"], ["Luxembourg", "卢森堡"], ["Netherlands", "荷兰"],
    ["Northern Ireland", "北爱尔兰"], ["Norway", "挪威"], ["Poland", "波兰"], ["Portugal", "葡萄牙"],
    ["Republic of Ireland", "爱尔兰共和国"], ["Scotland", "苏格兰"], ["Spain", "西班牙"], ["Sweden", "瑞典"],
    ["Switzerland", "瑞士"], ["Canada", "加拿大"], ["United States", "美国"], ["Brazil", "巴西"],
    ["Argentina", "阿根廷"], ["Chile", "智利"], ["Australia", "澳大利亚"], ["New Zealand", "新西兰"],
    ["Israel", "以色列"], ["China", "中国"], ["Hong Kong", "香港"], ["Taiwan", "台湾"],
    ["India", "印度"], ["Singapore", "新加坡"], ["Japan", "日本"], ["South Korea", "韩国"],
  ];

  for (const aliases of countries) {
    for (const buyerCountry of aliases) {
      assert.equal(deriveBuyerAdmission({ buyerCountry }).buyerCountryEligibility, "confirmed_admitted", buyerCountry);
    }
  }
});

test("admits Chinese and common aliases for each supplied buyer", () => {
  const buyers = ["Wal-Mart", "沃尔玛", "The Home Depot", "家得宝", "Target Corp", "塔吉特", "Costco Wholesale", "开市客", "好市多", "Chewy, Inc.", "Chewy宠物"];

  for (const buyerName of buyers) {
    assert.equal(deriveBuyerAdmission({ buyerName }).buyerPlatformType, "admitted_1p_retailer", buyerName);
  }
});

test("unknown buyer and country inputs require review and never imply admission", () => {
  assert.deepEqual(deriveBuyerAdmission({ buyerName: "Unknown Buyer", buyerCountry: "未知地区" }), {
    buyerPlatformType: "other",
    buyerCountryEligibility: "needs_review",
  });
  assert.deepEqual(deriveBuyerAdmission({ buyerName: "", buyerCountry: "" }), {
    buyerPlatformType: "other",
    buyerCountryEligibility: null,
  });
});
