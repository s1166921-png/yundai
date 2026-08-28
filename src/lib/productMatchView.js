import { MATCH_DISCLAIMER } from "./publicMatchContract.js";
import { normalizeCustomerAiText } from "./aiReportView.js";

const currencyUnit = (currency) => ({ RMB: "元", USD: "美元" }[currency] ?? currency ?? "");

const formatAmountValue = (value) => {
  if (!Number.isFinite(value)) return null;
  if (value >= 10000) {
    const wan = Math.round((value / 10000) * 10) / 10;
    return `${wan}万`;
  }
  return String(value);
};

const catalogProduct = (product) => ({
  id: product.id,
  institution: product.institution,
  name: product.name,
  currency: product.currency,
  limit: product.limit,
  term: product.term,
  pricing: product.pricing,
  scenario: product.scenario == null ? null : {
    id: product.scenario.id,
    label: product.scenario.label,
    order: product.scenario.order,
  },
  targetProfile: product.targetProfile,
  keyPrerequisite: product.keyPrerequisite,
});

const catalogProductFor = (reportProduct, products) => products.find((product) => (
  product.id === reportProduct?.productId
));

const SAFE_PRESENTATION_LABELS = new Set([
  "优先匹配",
  "备选方向",
  "可能方向",
  "待补信息",
  "优先产品方向",
  "备选产品方向",
  "待补关键信息",
  "暂不匹配",
]);

const formatEstimatedAmount = (estimatedAmount) => {
  if (estimatedAmount == null) return { amount: "待补信息后测算", amountNote: null };
  const note = typeof estimatedAmount.note === "string" && estimatedAmount.note
    ? estimatedAmount.note
    : null;
  if (estimatedAmount.kind === "manual") {
    return { amount: note ?? "待资金方进一步核定", amountNote: null };
  }
  const rawMinimum = estimatedAmount?.min;
  const rawMaximum = estimatedAmount?.max;
  const minimum = formatAmountValue(rawMinimum);
  const maximum = formatAmountValue(rawMaximum);
  const unit = currencyUnit(estimatedAmount?.currency);
  if (Number.isFinite(rawMaximum) && (!Number.isFinite(rawMinimum) || rawMinimum <= 0)) {
    return { amount: `最高${maximum}${unit}`, amountNote: note };
  }
  if (minimum != null && maximum != null) {
    return {
      amount: minimum === maximum ? `${minimum}${unit}` : `${minimum}-${maximum}${unit}`,
      amountNote: note,
    };
  }
  return { amount: note ?? "待资金方进一步核定", amountNote: null };
};

const safeExplanationList = (value) => (
  Array.isArray(value)
    ? value.map(normalizeCustomerAiText).filter(Boolean).slice(0, 3)
    : []
);

const deterministicEvidenceList = (value) => (
  Array.isArray(value)
    ? value
      .filter((item) => typeof item === "string")
      .map((item) => item.trim().slice(0, 200))
      .filter(Boolean)
      .slice(0, 3)
    : []
);

const explanationMapFrom = (aiReport) => {
  const explanations = new Map();
  if (!Array.isArray(aiReport?.productExplanations)) return explanations;
  for (const explanation of aiReport.productExplanations) {
    if (typeof explanation?.productId !== "string" || explanations.has(explanation.productId)) continue;
    explanations.set(explanation.productId, {
      aiReasons: safeExplanationList(explanation.reasons),
      aiItemsToConfirm: safeExplanationList(explanation.itemsToConfirm),
    });
  }
  return explanations;
};

const safeReportProduct = (reportProduct, products, explanations) => {
  if (reportProduct == null || typeof reportProduct !== "object") return null;
  const catalog = catalogProductFor(reportProduct, products);
  if (catalog == null) return null;
  const productId = catalog.id;
  const explanation = typeof reportProduct.productId === "string"
    ? explanations.get(reportProduct.productId)
    : null;
  const limit = catalog.limit ?? null;
  const currency = reportProduct.estimatedAmount?.currency ?? catalog.currency ?? "";
  const presentationLabel = SAFE_PRESENTATION_LABELS.has(reportProduct.presentationLabel)
    ? reportProduct.presentationLabel
    : "待补关键信息";
  const canShowAmount = presentationLabel === "优先匹配"
    || presentationLabel === "备选方向"
    || presentationLabel === "优先产品方向"
    || presentationLabel === "备选产品方向";
  const amountPresentation = formatEstimatedAmount(canShowAmount ? reportProduct.estimatedAmount : null);

  return {
    productId,
    institution: catalog.institution ?? "",
    name: catalog.name ?? "",
    whyMatched: deterministicEvidenceList(reportProduct.whyMatched),
    itemsToConfirm: deterministicEvidenceList(reportProduct.itemsToConfirm),
    aiReasons: explanation?.aiReasons ?? [],
    aiItemsToConfirm: explanation?.aiItemsToConfirm ?? [],
    presentationLabel,
    ...amountPresentation,
    currency,
    term: catalog.term ?? "目录暂未提供",
    pricing: catalog.pricing ?? "目录暂未提供",
    limit,
    scenario: catalog?.scenario ?? null,
    keyPrerequisite: catalog?.keyPrerequisite ?? null,
  };
};

const alternativeDifferences = (alternative, primary) => {
  const differences = [];
  if (alternative.scenario?.label && alternative.scenario.label !== primary?.scenario?.label) {
    differences.push(`业务场景：${alternative.scenario.label}`);
  }
  if (alternative.currency && alternative.currency !== primary?.currency) differences.push(`币种：${alternative.currency}`);
  if (alternative.term && alternative.term !== primary?.term) differences.push(`期限：${alternative.term}`);
  if (alternative.pricing && alternative.pricing !== primary?.pricing) differences.push(`定价：${alternative.pricing}`);
  if (alternative.amount && alternative.amount !== primary?.amount) differences.push(`参考额度：${alternative.amount}`);
  if (differences.length === 0 && alternative.keyPrerequisite) differences.push(`核心前置条件：${alternative.keyPrerequisite}`);
  return differences.slice(0, 2);
};

const buildCatalogView = (products) => {
  const groups = new Map();
  for (const rawProduct of products) {
    const product = catalogProduct(rawProduct);
    if (typeof product.scenario?.id !== "string" || typeof product.scenario?.label !== "string") continue;
    if (!groups.has(product.scenario.id)) {
      groups.set(product.scenario.id, {
        id: product.scenario.id,
        label: product.scenario.label,
        order: Number.isFinite(product.scenario.order) ? product.scenario.order : Number.MAX_SAFE_INTEGER,
        products: [],
      });
    }
    groups.get(product.scenario.id).products.push(product);
  }

  return {
    state: "catalog",
    groups: [...groups.values()]
      .sort((left, right) => left.order - right.order)
      .map(({ order: _order, ...group }) => group),
  };
};

const buildReportView = (report, products, aiReport) => {
  const explanations = explanationMapFrom(aiReport);
  const primary = safeReportProduct(report.primary, products, explanations);
  const missingDocuments = Array.isArray(report.missingDocuments)
    ? report.missingDocuments.filter((item) => typeof item === "string").slice(0, 5)
    : [];
  const alternatives = (Array.isArray(report.alternatives) ? report.alternatives : [])
    .slice(0, 2)
    .map((product) => safeReportProduct(product, products, explanations))
    .filter(Boolean)
    .map((product) => ({
      ...product,
      differences: alternativeDifferences(product, primary),
      missingInformation: missingDocuments.slice(0, 2),
    }));
  const nonMatches = (Array.isArray(report.nonMatches) ? report.nonMatches : [])
    .filter((item) => item != null && typeof item === "object")
    .map((item) => ({
      institution: typeof item.institution === "string" ? item.institution : "",
      name: typeof item.name === "string" ? item.name : "",
      reason: typeof item.reason === "string" ? item.reason : "",
      presentationLabel: "暂不匹配",
    }));

  return {
    state: "report",
    summary: typeof report.summary === "string" ? report.summary : "",
    primary,
    alternatives,
    missingDocuments,
    nonMatches,
    disclaimer: MATCH_DISCLAIMER,
  };
};

export function buildProductMatchView(report, products = [], aiReport = null) {
  const safeProducts = Array.isArray(products) ? products : [];
  return report == null ? buildCatalogView(safeProducts) : buildReportView(report, safeProducts, aiReport);
}

export function scrollProductMatchCenterIntoView(element, windowObject = globalThis.window) {
  if (element == null) return false;
  const reducedMotion = typeof windowObject?.matchMedia === "function"
    && windowObject.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const options = { behavior: reducedMotion ? "auto" : "smooth", block: "start" };

  if (typeof element.scrollIntoView === "function") {
    try {
      element.scrollIntoView(options);
      return true;
    } catch {
      try {
        element.scrollIntoView(true);
        return true;
      } catch {
        // Fall through to a positional scroll for older WebKit variants.
      }
    }
  }

  if (typeof element.getBoundingClientRect === "function" && typeof windowObject?.scrollTo === "function") {
    const top = element.getBoundingClientRect().top + (windowObject.pageYOffset ?? 0);
    windowObject.scrollTo(0, top);
    return true;
  }

  return false;
}
