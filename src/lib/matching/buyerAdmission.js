export const BUYER_ADMISSION_VERSION = "2026-08-25";

const normalize = (value) => typeof value === "string"
  ? value.normalize("NFKC").trim().toLowerCase().replace(/[.,]/g, "").replace(/\s+/g, " ")
  : "";

const ADMITTED_BUYERS = new Set([
  "walmart",
  "walmart inc",
  "walmart stores",
  "home depot",
  "the home depot",
  "home depot inc",
  "the home depot inc",
  "target",
  "target corporation",
  "target corp",
  "costco",
  "costco wholesale",
  "costco wholesale corporation",
  "chewy",
  "chewy inc",
]);

const ADMITTED_COUNTRIES = new Set([
  "美国",
  "united states",
  "united states of america",
  "us",
  "usa",
  "u s",
  "u s a",
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
