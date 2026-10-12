# Changelog

One entry per release. Write what changed under **Unreleased** as you go; `npm run release` moves those notes under
the new version number. Versions follow x.y.z: `patch` for fixes, `minor` for new features, `major` for changes that
need the owner to redo setup.

## Unreleased

## v0.1.0 — 2026-10-11

- Version number shown in the header; `version.json` published beside the page.
- "Update available" button: the page checks for a newer release when opened, when brought back to the foreground,
  and every 15 minutes, then reloads on click.
- `npm run release` bumps the version, updates this file, tags, and pushes; GitHub Actions deploys the page and
  creates a GitHub Release.
- M0 walking skeleton: Vite front end on GitHub Pages, Apps Script API with `whoami` and a locked test write,
  Google sign-in wiring, owner setup guide (`docs/SETUP.md`).
