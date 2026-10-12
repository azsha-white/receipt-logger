import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { compareVersions, judgeUpdate, parseSemver, parseVersionFile, startUpdateWatch, versionKey } from '../src/version.ts';

test('parseSemver accepts x.y.z with or without a leading v', () => {
  assert.deepEqual(parseSemver('0.1.0'), [0, 1, 0]);
  assert.deepEqual(parseSemver('v12.3.44'), [12, 3, 44]);
  assert.equal(parseSemver('1.2'), null);
  assert.equal(parseSemver('abc'), null);
});

test('compareVersions orders numerically, not as strings', () => {
  assert.equal(compareVersions('0.9.0', '0.10.0'), -1);
  assert.equal(compareVersions('1.0.0', '1.0.0'), 0);
  assert.equal(compareVersions('2.0.0', '1.99.99'), 1);
  assert.equal(compareVersions('junk', '1.0.0'), -1);
});

test('parseVersionFile reads the built file and rejects a 404 page', () => {
  assert.deepEqual(parseVersionFile('{"version":"0.1.0","build":"abc1234","built_at":"2026-10-11T00:00:00Z"}'),
    { version: '0.1.0', build: 'abc1234', built_at: '2026-10-11T00:00:00Z' });
  assert.equal(parseVersionFile('<!DOCTYPE html><title>404</title>'), null);
  assert.equal(parseVersionFile('{"version":1}'), null);
});

test('judgeUpdate: same build is quiet; newer version, new build, and rollback all offer an update', () => {
  const current = { version: '0.1.0', build: 'aaaaaaa' };
  assert.deepEqual(judgeUpdate(current, { version: '0.1.0', build: 'aaaaaaa' }), { kind: 'same' });
  const newer = judgeUpdate(current, { version: '0.2.0', build: 'bbbbbbb' });
  assert.equal(newer.kind, 'update');
  if (newer.kind === 'update') assert.equal(newer.label, 'Update available · v0.2.0');
  const rebuilt = judgeUpdate(current, { version: '0.1.0', build: 'ccccccc' });
  assert.equal(rebuilt.kind, 'update');
  if (rebuilt.kind === 'update') assert.match(rebuilt.label, /new build ccccccc/);
  assert.equal(judgeUpdate(current, { version: '0.0.9', build: 'ddddddd' }).kind, 'update');
});

test('startUpdateWatch calls onUpdate once a newer version.json is served, and stays quiet on errors', async () => {
  const seen: string[] = [];
  let body = '{"version":"0.1.0","build":"aaaaaaa"}';
  let status = 200;
  const fetchImpl = (async (url: string, init?: RequestInit) => {
    assert.match(url, /version\.json\?t=\d+$/);
    assert.equal(init?.cache, 'no-store');
    return { ok: status === 200, text: async () => body } as Response;
  }) as unknown as typeof fetch;
  const check = startUpdateWatch({
    url: '/receipt-logger/version.json',
    current: { version: '0.1.0', build: 'aaaaaaa' },
    onUpdate: (v) => seen.push(v.label),
    intervalMs: 60 * 60 * 1000,
    fetchImpl,
  });
  assert.equal((await check())?.kind, 'same');
  status = 404;
  assert.equal(await check(), null);
  status = 200;
  body = '{"version":"0.2.0","build":"bbbbbbb"}';
  assert.equal((await check())?.kind, 'update');
  assert.deepEqual(seen, ['Update available · v0.2.0']);
});

test('package.json version is semver and matches the CHANGELOG top entry', () => {
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { version: string };
  assert.ok(parseSemver(pkg.version), `package.json version "${pkg.version}" is not x.y.z`);
  const changelog = readFileSync(new URL('../CHANGELOG.md', import.meta.url), 'utf8');
  const first = /^## v(\d+\.\d+\.\d+)/m.exec(changelog);
  assert.ok(first, 'CHANGELOG.md has no "## vX.Y.Z" entry');
  assert.equal(first[1], pkg.version, 'CHANGELOG top entry must match package.json version');
});

test('versionKey is stable', () => {
  assert.equal(versionKey({ version: '0.1.0', build: 'abc' }), '0.1.0+abc');
});
