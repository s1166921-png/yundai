import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

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

test("legacy Vite targets retain iOS and Safari 10", async () => {
  const config = await readFile(viteConfigPath, "utf8");
  assert.match(config, /iOS >= 10/);
  assert.match(config, /Safari >= 10/);
});
