# Receipt Logger

A household receipt tracker for two people. Photograph a receipt on a phone or computer, assign it to one person or
split it, and see per-person, combined, and per-category spending over any month range. Every receipt lands as rows
in the household's own Google Sheet.

- **Live page:** https://azsha-white.github.io/receipt-logger/
- **Repository:** https://github.com/azsha-white/receipt-logger (public; no secrets live here by design)
- **Releases:** https://github.com/azsha-white/receipt-logger/releases · history in [CHANGELOG.md](CHANGELOG.md)

## How it is built

| Part | Where | Notes |
|---|---|---|
| Web page | `src/`, `index.html` | Vite + TypeScript, deployed to GitHub Pages by `.github/workflows/deploy.yml` on every push to `main` |
| API | `apps-script/` | Google Apps Script web app bound to the Sheet, runs as the Sheet's owner; deployed by the owner with `npm run gas:deploy` |
| Record | the owner's Google Sheet | tabs Receipts, Items, Settings, Categories; photos in a shared Drive folder |

Owner setup (Google Sheet, Apps Script, sign-in client) is in [docs/SETUP.md](docs/SETUP.md).

## Versions and updates

The version number is `"version"` in `package.json` (x.y.z). The build bakes it into the page and writes
`version.json` next to it. An open page re-reads `version.json` when it opens, when it comes back to the foreground,
and every 15 minutes. When the server has a different release, an **Update available · vX.Y.Z** button appears in the
header; clicking it reloads the page onto the new version.

To ship a release:

```sh
# write what changed under "## Unreleased" in CHANGELOG.md, commit, then:
npm run release -- patch    # or minor / major
```

That bumps the version, moves the changelog notes under it, commits, tags `vX.Y.Z`, and pushes. GitHub Actions
deploys the page and creates the GitHub Release. Changes under `apps-script/` reach the API only when the owner runs
`npm run gas:deploy`; the web app URL stays the same.

## Developing

```sh
npm install
npm run dev        # local page at http://localhost:5173/receipt-logger/
npm test           # node tests for the page helpers and the Apps Script logic (run against fakes)
npm run build      # typecheck + production build into dist/
```
