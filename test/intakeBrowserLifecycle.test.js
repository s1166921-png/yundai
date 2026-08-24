import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { access, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { createServer as createViteServer } from "vite";

const projectRoot = fileURLToPath(new URL("..", import.meta.url));
const chromePath = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function readDevToolsPort(userDataDirectory) {
  const activePortFile = path.join(userDataDirectory, "DevToolsActivePort");
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      const [port] = (await readFile(activePortFile, "utf8")).trim().split("\n");
      if (port) return Number(port);
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    await delay(50);
  }
  throw new Error("Chrome did not publish a DevTools port");
}

async function connectCdp(webSocketUrl) {
  const socket = new WebSocket(webSocketUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener("error", reject, { once: true });
  });

  let nextId = 1;
  const pending = new Map();
  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (!message.id || !pending.has(message.id)) return;
    const { resolve, reject } = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) reject(new Error(message.error.message));
    else resolve(message.result);
  });

  return {
    call(method, params = {}) {
      return new Promise((resolve, reject) => {
        const id = nextId;
        nextId += 1;
        pending.set(id, { resolve, reject });
        socket.send(JSON.stringify({ id, method, params }));
      });
    },
    close() {
      socket.close();
    },
  };
}

async function evaluate(cdp, expression) {
  const result = await cdp.call("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text);
  }
  return result.result.value;
}

async function waitFor(cdp, expression, message, timeoutMilliseconds = 5000) {
  const deadline = Date.now() + timeoutMilliseconds;
  while (Date.now() < deadline) {
    if (await evaluate(cdp, `Boolean(${expression})`)) return;
    await delay(50);
  }
  throw new Error(message);
}

const setControlValue = (selector, value) => `(() => {
  const control = document.querySelector(${JSON.stringify(selector)});
  if (!control) throw new Error("Missing control: " + ${JSON.stringify(selector)});
  const prototype = control instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(prototype, "value").set.call(control, ${JSON.stringify(value)});
  control.dispatchEvent(new Event("input", { bubbles: true }));
  control.dispatchEvent(new Event("change", { bubbles: true }));
  return control.value;
})()`;

const click = (selector) => `(() => {
  const control = document.querySelector(${JSON.stringify(selector)});
  if (!control) throw new Error("Missing control: " + ${JSON.stringify(selector)});
  control.click();
  return true;
})()`;

test("editing an in-flight intake prevents a stale response from restoring old results", { timeout: 30000 }, async (t) => {
  try {
    await access(chromePath);
  } catch {
    t.skip("Google Chrome is unavailable for the real component lifecycle check");
    return;
  }

  const temporaryDirectory = await mkdtemp(path.join(tmpdir(), "meiou-intake-browser-"));
  const vite = await createViteServer({
    root: projectRoot,
    configFile: false,
    cacheDir: path.join(temporaryDirectory, "vite-cache"),
    logLevel: "silent",
    plugins: [react()],
    server: { host: "127.0.0.1", port: 0, strictPort: false },
  });
  await vite.listen();
  const address = vite.httpServer.address();
  const pageUrl = `http://127.0.0.1:${address.port}/`;

  const chrome = spawn(chromePath, [
    "--headless=new",
    "--disable-background-networking",
    "--disable-component-update",
    "--disable-dev-shm-usage",
    "--disable-gpu",
    "--no-first-run",
    "--no-sandbox",
    "--remote-debugging-port=0",
    `--user-data-dir=${temporaryDirectory}`,
    "about:blank",
  ], { stdio: "ignore" });

  let cdp;
  t.after(async () => {
    cdp?.close();
    if (chrome.exitCode == null) {
      chrome.kill("SIGTERM");
      await Promise.race([once(chrome, "exit"), delay(3000)]);
      if (chrome.exitCode == null) {
        chrome.kill("SIGKILL");
        await once(chrome, "exit");
      }
    }
    await vite.close();
    await rm(temporaryDirectory, { recursive: true, force: true });
  });

  const devToolsPort = await readDevToolsPort(temporaryDirectory);
  const targets = await (await fetch(`http://127.0.0.1:${devToolsPort}/json/list`)).json();
  const pageTarget = targets.find((target) => target.type === "page");
  assert.ok(pageTarget?.webSocketDebuggerUrl, "Chrome must expose a page target");
  cdp = await connectCdp(pageTarget.webSocketDebuggerUrl);
  await cdp.call("Page.enable");
  await cdp.call("Runtime.enable");

  await cdp.call("Page.addScriptToEvaluateOnNewDocument", {
    source: `(() => {
      window.__leadRequests = [];
      window.fetch = (url, options = {}) => {
        const path = typeof url === "string" ? url : url.url;
        if (path.includes("/api/products")) {
          return Promise.resolve(new Response(JSON.stringify({ products: [] }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }));
        }
        if (path.includes("/api/leads")) {
          window.__leadRequests.push({ signal: options.signal, body: options.body });
          return new Promise((resolve) => setTimeout(() => resolve(new Response(JSON.stringify({
            ok: true,
            lead: {
              id: "stale-lead",
              createdAt: "2026-08-24T00:00:00.000Z",
              estimationMode: "simple",
              matchReport: {
                primary: {
                  productId: "linklogis-amazon-sc",
                  institution: "STALE RESULT MUST NOT RENDER",
                  name: "STALE RESULT MUST NOT RENDER",
                  currency: "USD",
                  pricing: null,
                  term: null,
                  limit: null,
                  presentationLabel: "优先匹配",
                  estimatedAmount: { kind: "range", currency: "USD", min: 1, max: 2 },
                  whyMatched: [],
                },
                alternatives: [],
                nonMatches: [],
                missingDocuments: [],
                summary: "STALE RESULT MUST NOT RENDER",
                disclaimer: "test",
              },
            },
          }), { status: 201, headers: { "Content-Type": "application/json" } })), 500));
        }
        return Promise.reject(new Error("Unexpected request: " + path));
      };
    })();`,
  });
  await cdp.call("Page.navigate", { url: pageUrl });
  await waitFor(cdp, "document.querySelector('.financing-intake')", "intake did not render");

  await evaluate(cdp, setControlValue('input[name="companyName"]', "Lifecycle Co."));
  await evaluate(cdp, setControlValue('input[name="contactName"]', "Lifecycle User"));
  await evaluate(cdp, setControlValue('input[name="phone"]', "13800138000"));
  await evaluate(cdp, click('.financing-intake button[type="submit"]'));
  await waitFor(cdp, "document.querySelector('input[name=\"businessModels\"]')", "step two did not render");

  await evaluate(cdp, click('input[name="businessModels"][value="amazon_sc"]'));
  await evaluate(cdp, click('.financing-intake button[type="submit"]'));
  await waitFor(cdp, "document.querySelector('input[name=\"primaryPlatformOrBuyerName\"]')", "step three did not render");

  await evaluate(cdp, setControlValue('input[name="primaryPlatformOrBuyerName"]', "Amazon"));
  await evaluate(cdp, click('.financing-intake button[type="submit"]'));
  await waitFor(cdp, "document.querySelector('input[name=\"annualRevenueRmb\"]')", "step four did not render");

  await evaluate(cdp, setControlValue('input[name="annualRevenueRmb"]', "12000000"));
  for (const field of ["hasCurrentOverdue", "hasDishonestyRecord", "hasMajorLitigation", "hasAbnormalOperations"]) {
    await evaluate(cdp, click(`input[name="${field}"][value="false"]`));
  }
  await evaluate(cdp, click('.financing-intake button[type="submit"]'));
  await waitFor(cdp, "document.querySelector('select[name=\"fundUse\"]')", "step five did not render");

  await evaluate(cdp, setControlValue('select[name="preferredCurrency"]', "usd"));
  await evaluate(cdp, setControlValue('input[name="requestedAmount"]', "1000000"));
  await evaluate(cdp, setControlValue('select[name="fundUse"]', "inventory_procurement"));
  await evaluate(cdp, click('input[name="consentToDataUse"]'));
  await evaluate(cdp, click('.financing-intake button[type="submit"]'));
  await waitFor(cdp, "window.__leadRequests.length === 1", "lead request did not start");

  assert.equal(await evaluate(cdp, "document.querySelector('select[name=\"fundUse\"]').disabled"), false);
  await evaluate(cdp, setControlValue('select[name="fundUse"]', "logistics_working_capital"));
  await delay(750);

  const outcome = await evaluate(cdp, `({
    requestWasAborted: window.__leadRequests[0].signal.aborted,
    staleTextVisible: document.body.textContent.includes("STALE RESULT MUST NOT RENDER"),
    reportVisible: Boolean(document.querySelector(".product-match-results")),
    formStatus: document.querySelector(".form-status")?.textContent || "",
    currentFundUse: document.querySelector('select[name="fundUse"]').value,
  })`);

  assert.deepEqual(outcome, {
    requestWasAborted: true,
    staleTextVisible: false,
    reportVisible: false,
    formStatus: "",
    currentFundUse: "logistics_working_capital",
  });

  await evaluate(cdp, "window.AbortController = undefined");
  await evaluate(cdp, click('.financing-intake button[type="submit"]'));
  await waitFor(cdp, "window.__leadRequests.length === 2", "legacy-style lead request did not start");
  await evaluate(cdp, setControlValue('select[name="fundUse"]', "receivables_turnover"));
  await delay(750);

  const legacyOutcome = await evaluate(cdp, `({
    requestHasNoSignal: window.__leadRequests[1].signal == null,
    staleTextVisible: document.body.textContent.includes("STALE RESULT MUST NOT RENDER"),
    reportVisible: Boolean(document.querySelector(".product-match-results")),
    formStatus: document.querySelector(".form-status")?.textContent || "",
    currentFundUse: document.querySelector('select[name="fundUse"]').value,
  })`);
  assert.deepEqual(legacyOutcome, {
    requestHasNoSignal: true,
    staleTextVisible: false,
    reportVisible: false,
    formStatus: "",
    currentFundUse: "receivables_turnover",
  });
});
