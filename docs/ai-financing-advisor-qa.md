# AI Financing Advisor Local QA

Date: 2026-08-28

## Configuration and data handling

Use the safe terminal prompts in `README.md` to provide a local API key and local admin
credentials. Never put secrets in chat, source, committed `.env` files, or browser
storage. QA profiles and local credentials must be synthetic only.

The no-key mode persists a submission and returns an explicitly labeled
`rules_fallback` report. With an official key, the service calls DeepSeek and validates
the response against deterministic ranks. A provider failure must still persist the lead
and return the fallback. Deployment and SMS are out of scope.

Official API check: Not run: official API key not configured.

## Automated evidence

| Check | Command | Result |
| --- | --- | --- |
| Full network-free suite | `/Users/vera/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node --test` | PASS: 303 passed, 0 failed, 0 skipped; 2736.540 ms. No key configured. |
| Modern and legacy build | `/Users/vera/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node ./node_modules/vite/bin/vite.js build` | PASS: modern assets plus `dist/assets/index-legacy-ocn0JUJP.js` built. |
| Exact privacy scan | `if rg -n "DEEPSEEK_API_KEY|Bearer test-key|api.deepseek.com/chat/completions|advisorFocus" dist/assets; then echo "browser bundle privacy violation"; exit 1; fi` | PASS: no output and exit 0. |
| Legacy/reduced-motion/old-WebKit tests | `/Users/vera/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node --test test/browserCompatibility.test.js test/productMatchView.test.js` | PASS: 18 passed, 0 failed. Includes reduced-motion override, iOS/Safari 10 targets, and `scrollIntoView(true)` old-WebKit fallback. |
| Legacy asset inspection | `find dist/assets -maxdepth 1 -type f -name 'index-legacy-*.js' -print -quit` | PASS: `dist/assets/index-legacy-ocn0JUJP.js`, 327612 bytes. |

The shell did not provide `node` on `PATH`; the bundled runtime above was used for every
Node command. The first sandboxed suite attempt could not bind local test ports
(`EPERM`); the recorded passing suite ran with loopback permission only.

## Local UAT evidence

The following was the original UAT result before the loopback CORS correction. It is
retained as historical evidence; the completed continuation is recorded below.

Local services used only loopback addresses, no `DEEPSEEK_API_KEY`, and disposable
synthetic identity values. No screenshots were retained.

| Viewport and journey | Observation | Status |
| --- | --- | --- |
| Customer, 1440x900 | Completed the rendered three-step Amazon SC form, enabled the microbank assessment, entered only synthetic values, and verified the information-use copy before submission. Submitting the final step returned `请求来源不被允许` instead of a report. | BLOCKED |
| Fallback label, deterministic order/amount, result privacy/disclaimer, customer overflow/clipping at 1440x900 | Not run after the blocked submission; no fallback report was rendered. | NOT RUN |
| Admin login, drawer, four review states, note, selected-only export, admin overflow/clipping at 1440x900 | Not run after the customer persistence blocker. | NOT RUN |
| Customer and admin journeys at 390x844 | Not run after the desktop blocker, per Task 8 instruction to stop on a product defect. | NOT RUN |

### Blocking concern for controller fix

The documented local API startup does not include `MEIOU_ALLOWED_ORIGINS`, while the
separately served Vite client uses `http://127.0.0.1:5173`. The API checks that browser
origin against its own `http://127.0.0.1:8787` origin and rejects it before persistence
in `server/index.mjs` (`applyCorsHeaders`, lines 308-323; request gate, lines 818-821).
The rendered form therefore cannot exercise no-key fallback persistence with the default
local workflow. No production code was changed under Task 8.

## Continuation: loopback CORS fix and completed UAT

### Diagnosis and fix

Vite correctly forwards the browser's `Origin: http://127.0.0.1:5173`, but the API had
compared it only with its own `http://127.0.0.1:8787` origin or an explicit allowlist.
The default local workflow therefore received 403 before persistence. The server now
allows exactly `http://127.0.0.1:5173` and `http://localhost:5173`, only while the API
host itself is loopback. Other origins still require `MEIOU_ALLOWED_ORIGINS` and no
wildcard, port range, or production-origin policy was added.

### Continuation automated evidence

| Check | Command | Result |
| --- | --- | --- |
| Focused loopback CORS integration | `/Users/vera/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node --test --test-name-pattern='CORS|documented loopback' test/serverLead.test.js` | PASS: 3 passed, 0 failed. Covers `127.0.0.1:5173` and `localhost:5173` preflight, a progressive fallback POST, and rejects `127.0.0.1:5174`. |
| Full network-free suite | `/Users/vera/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node --test` | PASS: 304 passed, 0 failed, 0 skipped; 2851.864 ms. |
| Modern and legacy build/privacy scan | `/Users/vera/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node ./node_modules/vite/bin/vite.js build` followed by the exact `rg` privacy scan above | PASS: modern and legacy bundles built; scan printed no matches. |
| Legacy/reduced-motion/old-WebKit confirmation | `/Users/vera/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node --test test/browserCompatibility.test.js test/productMatchView.test.js` | PASS: 18 passed, 0 failed; legacy asset `index-legacy-ocn0JUJP.js` inspected at 327612 bytes. |

### Completed local UAT

An isolated loopback API used a temporary synthetic-only lead store; Vite and headless
Chrome used only loopback addresses and no `DEEPSEEK_API_KEY`. No screenshots were kept.

| Viewport and journey | Observation | Status |
| --- | --- | --- |
| Customer, 1440x900 | Three-step synthetic Amazon SC submission completed. The result showed `规则匹配报告`, primary `微众银行跨境电商数据贷`, deterministic `75万-262.5万元`, the same two ordered alternatives, privacy copy, and the non-approval disclaimer. No page overflow or result/intake text clipping. | PASS |
| Admin, 1440x900 | Synthetic admin login, drawer, all four states (`pending`, `in_review`, `reviewed`, `needs_information`), note save, one-record selection, and Excel export completed. No admin-control/drawer overflow or clipping. | PASS |
| Customer, 390x844 | Repeated the synthetic Amazon SC submission with the same explicit fallback, product order, amount, privacy, and disclaimer. No page overflow or result/intake text clipping. | PASS |
| Admin, 390x844 | Repeated login, drawer, four review states, note, selected-only export, and layout checks. | PASS |
| Reduced motion | Chrome emulated `prefers-reduced-motion: reduce`; the media query was active. Targeted tests verify the no-animation override and old-WebKit boolean scroll fallback. | PASS |

Official API check: Not run: official API key not configured.

## Browser and device limits

Reduced motion, legacy target configuration, and the old-WebKit boolean scroll fallback
are covered by the passing targeted tests above. The legacy asset was inspected after the
production build. Chrome emulation and tests are not physical-device evidence. Physical
iPhone/Safari verification was not available and remains an external device limitation.

## Scope and secret audit

The continuation's intended commit is limited to `server/index.mjs`,
`test/serverLead.test.js`, `README.md`, and this QA record. `.gitignore` already ignores
`node_modules/`, `dist/`, `server/data/leads.json`, and local QA images, so it was not
changed. Build assets, local lead data, temporary browser state, secrets, credentials,
and screenshots are not staged or committed.
