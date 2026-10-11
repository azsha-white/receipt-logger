// npm run gas:create
// One-time, owner only: creates the "Receipt Logger" Google Sheet with its attached Apps Script project,
// and writes .clasp.json (the script id; not a secret) at the repo root.
//
// Why a wrapper: `clasp create` downloads the new project's starter files into apps-script/, which would
// overwrite our appsscript.json (the web app settings) and add an empty Code.js. This puts ours back.
import { existsSync, readFileSync, writeFileSync, readdirSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const srcDir = path.join(root, 'apps-script');
const manifestPath = path.join(srcDir, 'appsscript.json');
const claspBin = path.join(root, 'node_modules', '@google', 'clasp', 'build', 'src', 'index.js');
const ours = new Set(readdirSync(srcDir));

if (existsSync(path.join(root, '.clasp.json'))) {
  console.log('.clasp.json already exists, so the Sheet and script were already created. Nothing to do.');
  console.log('Next: npm run gas:push');
  process.exit(0);
}

const manifest = readFileSync(manifestPath, 'utf8');
const result = spawnSync(process.execPath,
  [claspBin, 'create-script', '--type', 'sheets', '--title', 'Receipt Logger', '--rootDir', 'apps-script'],
  { cwd: root, stdio: 'inherit' });

writeFileSync(manifestPath, manifest);
for (const name of readdirSync(srcDir)) {
  if (ours.has(name)) continue;
  const file = path.join(srcDir, name);
  if (/function myFunction\(\)\s*\{\s*\}/.test(readFileSync(file, 'utf8'))) {
    rmSync(file);
    console.log(`Removed the empty starter file apps-script/${name}.`);
  }
}

if (result.status !== 0) {
  console.error('\nclasp create failed (see the message above). Did you run "npm run gas:login" and turn on the Apps Script API?');
  process.exit(result.status ?? 1);
}
console.log('\nDone. The new Sheet is in your Google Drive, named "Receipt Logger".');
console.log('Next: npm run gas:push');
