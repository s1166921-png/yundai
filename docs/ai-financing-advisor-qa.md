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

## Browser and device limits

Reduced motion, legacy target configuration, and the old-WebKit boolean scroll fallback
are covered by the passing targeted tests above. The legacy asset was inspected after the
production build. Chrome emulation and tests are not physical-device evidence. Physical
iPhone/Safari verification was not available and remains an external device limitation.

## Scope and secret audit

Only documentation is intended for commit: `README.md` and this QA record. `.gitignore`
already ignores `node_modules/`, `dist/`, `server/data/leads.json`, and local QA images,
so it was not changed. Build assets, local lead data, temporary browser state, secrets,
credentials, and screenshots are not staged or committed.
