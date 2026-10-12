// npm run release -- patch | minor | major     (default: patch)
//
// Ships a new version to everyone:
//   1. refuses to run with uncommitted changes, and runs the tests
//   2. bumps "version" in package.json (patch 0.1.0 -> 0.1.1, minor -> 0.2.0, major -> 1.0.0)
//   3. moves the CHANGELOG "Unreleased" notes under the new version with today's date
//   4. commits "Release vX.Y.Z", tags vX.Y.Z, pushes both
// GitHub Actions then builds and deploys the page (deploy.yml) and creates the GitHub Release (release.yml).
// Every open copy of the page sees the new version.json within 15 minutes, or at once when reopened, and shows
// the "Update available" button.
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const type = process.argv[2] ?? 'patch';
if (!['patch', 'minor', 'major'].includes(type)) {
  console.error(`Usage: npm run release -- patch|minor|major   (got "${type}")`);
  process.exit(2);
}

function run(cmd, args, { capture = false, allowFail = false } = {}) {
  const r = spawnSync(cmd, args, {
    cwd: root,
    stdio: capture ? ['inherit', 'pipe', 'inherit'] : 'inherit',
    encoding: 'utf8',
    shell: process.platform === 'win32', // npm is npm.cmd on Windows
  });
  if (r.status !== 0 && !allowFail) {
    console.error(`\n${cmd} ${args.join(' ')} failed.`);
    process.exit(r.status ?? 1);
  }
  return r;
}

const branch = run('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { capture: true }).stdout.trim();
if (branch !== 'main') {
  console.error(`Releases go out from main; you are on "${branch}".`);
  process.exit(1);
}
if (run('git', ['status', '--porcelain'], { capture: true }).stdout.trim() !== '') {
  console.error('Commit or stash your changes first; the working tree must be clean to release.');
  process.exit(1);
}

run('npm', ['test']);

// Bump package.json (and package-lock.json) without npm's own commit and tag; we make those ourselves below.
run('npm', ['version', type, '--no-git-tag-version']);
const version = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8')).version;
const tag = `v${version}`;

// CHANGELOG: "## Unreleased" becomes the new version's heading, and a fresh empty Unreleased goes above it.
const changelogPath = path.join(root, 'CHANGELOG.md');
let changelog = readFileSync(changelogPath, 'utf8');
const today = new Date().toISOString().slice(0, 10);
if (!/^## Unreleased\s*$/m.test(changelog)) {
  console.error('CHANGELOG.md needs a "## Unreleased" heading with notes for this release.');
  process.exit(1);
}
const unreleasedBody = changelog.split(/^## Unreleased\s*$/m)[1]?.split(/^## /m)[0]?.trim() ?? '';
if (!unreleasedBody) {
  console.error('CHANGELOG.md: write at least one line under "## Unreleased" saying what changed.');
  process.exit(1);
}
changelog = changelog.replace(/^## Unreleased\s*$/m, `## Unreleased\n\n## ${tag} — ${today}`);
writeFileSync(changelogPath, changelog);

run('git', ['add', 'package.json', 'package-lock.json', 'CHANGELOG.md']);
run('git', ['commit', '-m', `Release ${tag}`]);
run('git', ['tag', '-a', tag, '-m', `Release ${tag}`]);
run('git', ['push', '--follow-tags']);

console.log(`\nReleased ${tag}.`);
console.log('GitHub Actions is building and deploying it now (about 1–2 minutes):');
console.log('  https://github.com/azsha-white/receipt-logger/actions');
console.log('Open pages show "Update available" on their next check (within 15 minutes, or at once when reopened).');
console.log('Apps Script changes are separate: the owner runs `npm run gas:deploy` for those.');
