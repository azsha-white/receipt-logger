// npm run gas:deploy
// Owner only: pushes apps-script/ and deploys it as the web app. The first run creates the deployment;
// later runs update that same deployment, so the web app URL never changes.
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const claspBin = path.join(root, 'node_modules', '@google', 'clasp', 'build', 'src', 'index.js');
const DESCRIPTION = 'receipt-logger web app';

function clasp(args, { capture = false } = {}) {
  const r = spawnSync(process.execPath, [claspBin, ...args], {
    cwd: root,
    stdio: capture ? ['inherit', 'pipe', 'inherit'] : 'inherit',
    encoding: 'utf8',
  });
  if (r.status !== 0) {
    console.error(`\nclasp ${args.join(' ')} failed (see the message above).`);
    process.exit(r.status ?? 1);
  }
  return r.stdout;
}

clasp(['push', '--force']);

// Versioned deployments only; the "@HEAD" test deployment has no version number.
const deployments = JSON.parse(clasp(['--json', 'list-deployments'], { capture: true }))
  .filter((d) => d.versionNumber !== undefined && d.versionNumber !== null);
const existing = deployments.find((d) => d.description === DESCRIPTION) ?? deployments[0];

const args = ['--json', 'create-deployment', '--description', DESCRIPTION];
if (existing) args.push('--deploymentId', existing.deploymentId);
const deployed = JSON.parse(clasp(args, { capture: true }));

const url = `https://script.google.com/macros/s/${deployed.deploymentId}/exec`;
console.log(`\n${existing ? 'Updated' : 'Created'} the web app deployment (version ${deployed.versionNumber}).`);
console.log('Web app URL (paste this into src/config.ts as APPS_SCRIPT_URL):');
console.log(`\n  ${url}\n`);
