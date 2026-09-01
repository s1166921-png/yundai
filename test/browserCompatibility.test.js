import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "vite";

const stylesPath = new URL("../src/styles.css", import.meta.url);
const viteConfigPath = new URL("../vite.config.mjs", import.meta.url);

test("progressive intake keeps legacy-safe Flexbox fallbacks before Grid", async () => {
  const styles = await readFile(stylesPath, "utf8");

  for (const selector of [".wizard-progress", ".intake-fields", ".intake-group-tabs", ".checkbox-options", ".segmented-control", ".webank-toggle"]) {
    const start = styles.indexOf(`${selector} {`);
    const end = styles.indexOf("}", start);
    const rule = styles.slice(start, end);
    assert.ok(start >= 0, `${selector} rule is missing`);
    assert.ok(rule.indexOf("display: flex") >= 0, `${selector} needs a Flexbox fallback`);
    if (rule.includes("display: grid")) {
      assert.ok(rule.indexOf("display: flex") < rule.indexOf("display: grid"), `${selector} fallback must precede Grid`);
    }
  }
});

test("AI report and trust module keep Flexbox fallbacks before stable Grid tracks", async () => {
  const styles = await readFile(stylesPath, "utf8");
  const selectors = [
    ".ai-diagnostic-flow",
    ".ai-trust-layout",
    ".ai-trust-points",
    ".ai-example dl",
    ".ai-report-status",
    ".ai-report-business",
    ".ai-report-actions",
  ];

  for (const selector of selectors) {
    const start = styles.indexOf(`${selector} {`);
    const end = styles.indexOf("}", start);
    const rule = styles.slice(start, end);
    assert.ok(start >= 0, `${selector} rule is missing`);
    assert.ok(rule.indexOf("display: flex") >= 0, `${selector} needs a Flexbox fallback`);
    assert.ok(rule.indexOf("display: flex") < rule.indexOf("display: grid"), `${selector} fallback must precede Grid`);
    assert.match(rule, /grid-template-columns:/, `${selector} needs stable Grid tracks`);
  }

  for (const selector of [".ai-trust-layout", ".ai-trust-points"]) {
    const start = styles.indexOf(`${selector} {`);
    const end = styles.indexOf("}", start);
    const rule = styles.slice(start, end);
    assert.match(rule, /flex-wrap:\s*wrap/, `${selector} needs a wrapping legacy fallback`);
  }

  assert.equal(styles.includes(".ai-report-product"), false, "removed anonymous AI cards must stay removed");
});

test("trust module legacy fallback stacks at mobile widths and long result strings can wrap", async () => {
  const styles = await readFile(stylesPath, "utf8");
  const tabletStart = styles.indexOf("@media (max-width: 1120px)");
  const mobileStart = styles.indexOf("@media (max-width: 720px)");
  const tabletRules = styles.slice(tabletStart, mobileStart);
  const mobileRules = styles.slice(mobileStart);
  const resultListStart = styles.indexOf(".primary-result-reasons li,");
  const resultListEnd = styles.indexOf("}", resultListStart);
  const resultListRule = styles.slice(resultListStart, resultListEnd);

  assert.ok(tabletStart >= 0 && mobileStart > tabletStart, "responsive trust breakpoints are missing");
  assert.match(tabletRules, /\.ai-trust-points,\s*\.ai-example\s*\{[\s\S]*?flex-basis:\s*100%/);
  assert.match(mobileRules, /\.ai-trust-points section,\s*\.ai-example dl > div\s*\{[\s\S]*?flex-basis:\s*100%[\s\S]*?width:\s*100%/);
  assert.match(resultListRule, /overflow-wrap:\s*anywhere/);
});

test("no-match improvement paths use a stable grid that stacks safely on mobile", async () => {
  const styles = await readFile(stylesPath, "utf8");
  const gridStart = styles.indexOf(".match-improvement-path-grid {");
  const gridEnd = styles.indexOf("}", gridStart);
  const gridRule = styles.slice(gridStart, gridEnd);
  const mobileStart = styles.indexOf("@media (max-width: 720px)");
  const mobileRules = styles.slice(mobileStart);

  assert.ok(gridStart >= 0, "improvement-path grid is missing");
  assert.ok(gridRule.indexOf("display: flex") < gridRule.indexOf("display: grid"), "grid needs a Flexbox fallback");
  assert.match(gridRule, /flex-wrap:\s*wrap/);
  assert.match(gridRule, /grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(mobileRules, /\.match-improvement-path-grid\s*\{[\s\S]*?grid-template-columns:\s*1fr/);
  assert.match(mobileRules, /\.match-improvement-path\s*\{[\s\S]*?flex-basis:\s*100%[\s\S]*?width:\s*100%/);
});

test("AI report line reveal has an explicit reduced-motion override", async () => {
  const styles = await readFile(stylesPath, "utf8");
  const reducedMotionStart = styles.indexOf("@media (prefers-reduced-motion: reduce)");
  const reducedMotionRule = styles.slice(reducedMotionStart);

  assert.ok(reducedMotionStart >= 0, "reduced-motion media query is missing");
  assert.match(reducedMotionRule, /\.ai-report-status::after[\s\S]*animation:\s*none\s*!important/);
});

test("legacy Vite targets retain iOS and Safari 10", async () => {
  const config = await readFile(viteConfigPath, "utf8");
  assert.match(config, /iOS >= 10/);
  assert.match(config, /Safari >= 10/);
});

test("production build emits distinct modern and legacy entry assets", async (t) => {
  const outputDirectory = await mkdtemp(path.join(tmpdir(), "meiou-browser-build-"));
  t.after(() => rm(outputDirectory, { recursive: true, force: true }));

  await build({
    configFile: fileURLToPath(viteConfigPath),
    logLevel: "silent",
    build: { outDir: outputDirectory, emptyOutDir: true },
  });

  const assets = await readdir(path.join(outputDirectory, "assets"));
  const modernEntry = assets.find((asset) => /^index-[\w-]+\.js$/.test(asset) && !asset.includes("legacy"));
  const legacyEntry = assets.find((asset) => /^index-legacy-[\w-]+\.js$/.test(asset));

  assert.ok(modernEntry, "the modern entry asset is missing");
  assert.ok(legacyEntry, "the legacy entry asset is missing");
});
