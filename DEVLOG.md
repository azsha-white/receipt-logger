# DEVLOG

Newest entry on top. One entry per finished feature or session.

---

# 2026-10-11 — v0.1.0: version number, "Update available" button, release flow (R23)

The user asked, after the design freeze, that the app update whenever someone updates it, with an "update available" button they click, a GitHub repository, and a version number. The repo already existed from M0 (https://github.com/azsha-white/receipt-logger); this adds the rest.

**What changed**
- `package.json` version is now the release number (0.1.0). `vite.config.ts` bakes it in as `__APP_VERSION__` and emits `dist/version.json` (`{ version, build, built_at }`).
- `src/version.ts`: semver compare, `version.json` parsing, `judgeUpdate` (newer version, same version with a new build, or a rollback all count as an update), and `startUpdateWatch` (poll after 1.5 s, on every return to the foreground, every 15 minutes; `cache: 'no-store'` plus a `?t=` query).
- `src/update-ui.ts`: header version label, the **Update available · vX.Y.Z** button (reloads on click), and the after-reload notice ("Updated to vX.Y.Z" or "still rolling out" when the host still served the old page). Skipped on the dev server, which has no `version.json`.
- `scripts/release.mjs` (`npm run release -- patch|minor|major`): clean tree on main, tests, bump, CHANGELOG "Unreleased" → version heading, commit, annotated tag, push. `.github/workflows/release.yml` creates the GitHub Release from the tag. `CHANGELOG.md` and `README.md` added.

**Verified**
- Observed: 33 node tests pass (7 new in `test/version.test.ts`, including one that keeps `package.json` and the CHANGELOG top entry in step). `npm run build` emits `version.json`.
- Observed: headless Edge against `vite preview`: the header shows v0.1.0 and the button stays hidden when `version.json` matches; with `version.json` edited to 0.2.0 the button appears reading "Update available · v0.2.0".
- The live `version.json` and the GitHub Release were checked after the push; see the session report.

**Gotchas**
- GitHub Pages caches HTML for about 10 minutes (reported). The poll bypasses that for `version.json`, so the button can appear before the new page is downloadable; the "still rolling out" notice covers it. Measure the real delay once in M1.
- `npm run release` refuses an empty "Unreleased" section on purpose: every release needs one line of notes.
- Node's `spawnSync('npm')` needs `shell: true` on Windows (npm is `npm.cmd`).

**Reach**
A push to `main` deploys; a `vX.Y.Z` tag also creates a GitHub Release. Open pages see the new `version.json` within 15 minutes or on reopen. Apps Script changes still need the owner's `npm run gas:deploy`.

---

# 2026-10-11 — M0 walking skeleton live on GitHub Pages; backend waits on the owner's Google setup

The page is live at https://azsha-white.github.io/receipt-logger/ (repo https://github.com/azsha-white/receipt-logger, public). It shows "Not configured yet" until the owner pastes the OAuth client id and the Apps Script URL into `src/config.ts`. The Apps Script backend and Google sign-in are **written but unverified**: none of it has run on Google yet, because that needs the owner's `clasp login` and Google Cloud steps (`docs/SETUP.md`).

**State now**
- Observed: `npm run typecheck` and `npm run build` pass. `npm test` runs 26 node tests, all passing. Breaking the header check on purpose makes 2 of them fail, so the tests have teeth.
- Observed: the GitHub Actions run (test, build, deploy) is green. The live URL returns 200 with the built HTML. Headless Edge renders it with the banner shown, the buttons disabled, and the footer build id equal to the deployed commit. The layout fits 390 px and 320 px viewports.
- Observed against fakes only: `test/apps-script-wiring.test.ts` runs `apps-script/*.js` against in-memory fakes of SpreadsheetApp, CacheService, UrlFetchApp, LockService, Utilities and ContentService. It covers setup, whoami, the cache hit, `NOT_A_MEMBER`, `BAD_TOKEN`, the locked test row, `SCHEMA_MISMATCH`, and `INTERNAL` as JSON. This proves our wiring, not Google's behaviour.
- Not run: spikes 1–4 (cross-origin read, tokeninfo + cache, no consent for member 2, iPhone JPEG). They are recorded as "not yet run, needs owner setup" in `.forge/software-designer/receipt-tracker/RISKS.md` §5.

**Shape**
- Front end: `src/main.ts` (wiring), `src/api.ts` (text/plain POST, envelope parsing, config check), `src/gis.ts` (sign-in button), `src/files.ts` (spike 4: magic-byte sniff, so a HEIC labelled `image/jpeg` still fails), `src/config.ts` (the two public values).
- Apps Script: `apps-script/Lib.js` (pure logic, node-tested), `Api.js` (doPost/doGet, tokeninfo + cache, the locked write), `Setup.js` (setup()). The script is bound to the Sheet that `npm run gas:create` makes.
- Actions: `whoami`, and `test.add_row`, which is M0-only and writes a $0 "TEST ROW (M0)" to Receipts.

**Gotchas**
- `clasp create` downloads the new project's starter files into `apps-script/`, which overwrites `appsscript.json` (the web app settings) and adds a `Code.js`. `scripts/clasp-create.mjs` restores ours and deletes the stub. Do not run `clasp create` directly.
- `scripts/clasp-deploy.mjs` reuses the existing versioned deployment (`--deploymentId`), so the `/exec` URL never changes. `clasp deploy` with no id would mint a new URL and break the page config.
- `node --test test/` fails on Node 24 because a bare directory is treated as a module path. The script uses the glob `"test/*.test.ts"`. Node 24 strips the TypeScript types itself, with no build step.
- Headless Chrome/Edge `--window-size` has a minimum of about 500 px, so a 390 px screenshot looks clipped. To check phone width, render the page inside a 390 px iframe.
- Scopes are `spreadsheets.currentonly` and `script.external_request`. This relies on `getActiveSpreadsheet()` working inside a bound script's web app, which is reported, not yet observed. If whoami returns `INTERNAL` saying "not attached to the Sheet", switch to the full `spreadsheets` scope with `openById`.
- Error codes: `INTERNAL` is added beyond `DATA.md` §4, so that script crashes come back as JSON. The page has its own client-side codes, `NETWORK`, `NOT_JSON` and `BAD_ENVELOPE`. A lock timeout returns `INTERNAL` ("try again").
- `appsscript.json` timeZone is `America/New_York`, which is assumed. Change it if the household is elsewhere.

**Open decisions**
- Which spouse is the owner. Nothing in the code depends on it. Member names and emails live in the Sheet's Settings tab.

**Next steps**
1. The owner follows `docs/SETUP.md` Parts 1–4, then runs the Part 5 checks on iPhone Safari, Android Chrome and desktop Chrome, and reports back with the Part 6 form.
2. Record each spike result as observed or failed in `RISKS.md` §5. If spike 1 fails anywhere, switch to fallback A (the page served by HtmlService) and add a dated note to `ARCHITECTURE.md`.
3. Then M1 (`MILESTONES.md`). Remove `test.add_row` once real writes exist.

**Reach**
A push to `main` deploys the page automatically. Apps Script changes reach the web app only when the owner runs `npm run gas:deploy`.
