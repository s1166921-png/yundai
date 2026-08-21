import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const stylesPath = new URL("../src/styles.css", import.meta.url);
const viteConfigPath = new URL("../vite.config.mjs", import.meta.url);

test("wizard CSS declares Flexbox fallbacks before Grid enhancement", async () => {
  const styles = await readFile(stylesPath, "utf8");

  for (const selector of [".estimate-mode-switch", ".wizard-progress", ".intake-fields", ".checkbox-options", ".segmented-control"]) {
    const start = styles.indexOf(`${selector} {`);
    const end = styles.indexOf("}", start);
    const rule = styles.slice(start, end);
    assert.ok(start >= 0, `${selector} rule is missing`);
    assert.ok(rule.indexOf("display: flex") >= 0, `${selector} needs a Flexbox fallback`);
    if (rule.includes("display: grid")) {
      assert.ok(rule.indexOf("display: flex") < rule.indexOf("display: grid"), `${selector} fallback must precede Grid`);
    }
  }

  assert.match(styles, /@supports\s*\(display:\s*grid\)/);
});

test("legacy Vite targets retain iOS and Safari 10", async () => {
  const config = await readFile(viteConfigPath, "utf8");
  assert.match(config, /iOS >= 10/);
  assert.match(config, /Safari >= 10/);
});

test("product match Flexbox fallbacks use margin gutters and Grid resets them once", async () => {
  const styles = await readFile(stylesPath, "utf8");

  assert.match(styles, /\.product-catalog-card:not\(:nth-child\(3n \+ 1\)\)\s*\{[^}]*margin-left:\s*18px/s);
  assert.match(styles, /\.match-alternative-result \+ \.match-alternative-result\s*\{[^}]*margin-left:\s*18px/s);
  assert.match(styles, /\.primary-result-reasons section \+ section\s*\{[^}]*margin-left:\s*34px/s);
  assert.match(styles, /@supports\s*\(display:\s*grid\)\s*\{[\s\S]*margin-left:\s*0;[\s\S]*margin-bottom:\s*0;/);
  assert.equal((styles.match(/@supports\s*\(display:\s*grid\)\s*\{[\s\S]*?\.product-catalog-card,/g) ?? []).length, 1);
});
