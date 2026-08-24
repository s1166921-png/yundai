import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = fileURLToPath(new URL("..", import.meta.url));
const viteCli = fileURLToPath(new URL("../node_modules/vite/bin/vite.js", import.meta.url));

async function filesBelow(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await filesBelow(entryPath));
    else files.push(entryPath);
  }
  return files;
}

test("modern and legacy production browser bundles exclude matching internals", async (t) => {
  const outputDirectory = await mkdtemp(path.join(tmpdir(), "meiou-bundle-privacy-"));
  t.after(() => rm(outputDirectory, { recursive: true, force: true }));

  const build = spawnSync(process.execPath, [viteCli, "build", "--outDir", outputDirectory, "--emptyOutDir"], {
    cwd: projectRoot,
    encoding: "utf8",
  });
  assert.equal(build.status, 0, build.stderr || build.stdout);

  const browserFiles = (await filesBelow(outputDirectory)).filter((file) => /\.(?:html|js|css)$/.test(file));
  const serializedBundle = (await Promise.all(browserFiles.map((file) => readFile(file, "utf8")))).join("\n");

  assert.match(serializedBundle, /index-legacy-/);
  assert.doesNotMatch(
    serializedBundle,
    /ruleSet|ruleVersion|internalReason|fitScore|fitDimensions|confidence|failedRules|inputSnapshot|formulaKey|needs_information|反洗钱黑名单|预警信息|两个年度销售收入下滑超过 30%/,
  );
});
