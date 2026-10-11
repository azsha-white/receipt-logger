// Loads apps-script/Lib.js the way Apps Script does (plain globals in one scope) and checks its pure logic.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../apps-script/Lib.js', import.meta.url), 'utf8');
const gas: any = vm.createContext({});
vm.runInContext(source, gas);
// Objects created inside the vm have a different prototype chain, so compare plain copies.
const plain = (x: unknown) => JSON.parse(JSON.stringify(x));

const settings = {
  schema_version: 1,
  member_1_name: 'Ann', member_1_email: 'Ann@Example.com',
  member_2_name: 'Bo', member_2_email: 'bo@example.com',
  google_client_id: 'cid.apps.googleusercontent.com',
};
const now = 1_800_000_000;
const claims = (over: Record<string, unknown> = {}) => ({
  aud: 'cid.apps.googleusercontent.com', iss: 'https://accounts.google.com', exp: String(now + 3000),
  email: 'ann@example.com', email_verified: 'true', ...over,
});

test('parseEnvelope accepts the DATA.md envelope and defaults payload to {}', () => {
  assert.deepEqual(plain(gas.parseEnvelope('{"id_token":"t","action":"whoami"}')),
    { ok: true, value: { id_token: 't', action: 'whoami', payload: {} } });
});

test('parseEnvelope rejects bad bodies with the right codes', () => {
  const code = (t: unknown) => gas.parseEnvelope(t).error.code;
  assert.equal(code(''), 'BAD_REQUEST');
  assert.equal(code('not json'), 'BAD_REQUEST');
  assert.equal(code('[1]'), 'BAD_REQUEST');
  assert.equal(code('{"id_token":"t"}'), 'BAD_REQUEST');
  assert.equal(code('{"action":"whoami"}'), 'BAD_TOKEN');
  assert.equal(code('{"id_token":"t","action":"x","payload":[1]}'), 'BAD_REQUEST');
});

test('Receipts header uses member names, with neutral fallbacks', () => {
  const h = gas.expectedHeaders('Receipts', settings);
  assert.equal(h.length, 18);
  assert.equal(h[8], 'Ann share');
  assert.equal(h[9], 'Bo share');
  assert.equal(h[17], 'Updated at');
  assert.equal(gas.expectedHeaders('Receipts', {})[8], 'Member 1 share');
  assert.equal(gas.expectedHeaders('Items', settings).length, 13);
  assert.equal(gas.expectedHeaders('Items', settings)[12], 'Bo share');
});

test('checkHeaders: match, trailing blanks ok, edited cell -> SCHEMA_MISMATCH naming the column', () => {
  const expected = gas.expectedHeaders('Receipts', settings);
  assert.equal(gas.checkHeaders('Receipts', [...expected, '', ''], expected), null);
  assert.equal(gas.checkHeaders('Receipts', expected.map((s: string) => ` ${s} `), expected), null);
  const edited = [...expected];
  edited[2] = 'Shop';
  const err = gas.checkHeaders('Receipts', edited, expected);
  assert.equal(err.error.code, 'SCHEMA_MISMATCH');
  assert.match(err.error.message, /column C should be "Store" but is "Shop"/);
  const extra = gas.checkHeaders('Receipts', [...expected, 'My column'], expected);
  assert.match(extra.error.message, /column S/);
  const short = gas.checkHeaders('Receipts', expected.slice(0, 5), expected);
  assert.equal(short.error.code, 'SCHEMA_MISMATCH');
});

test('checkClaims: member 1 and 2 accepted, case-insensitive email', () => {
  assert.deepEqual(plain(gas.checkClaims(claims(), settings, now)),
    { ok: true, member: { email: 'ann@example.com', name: 'Ann', member_index: 1 } });
  assert.equal(gas.checkClaims(claims({ email: 'BO@example.com' }), settings, now).member.member_index, 2);
});

test('checkClaims: every failure path', () => {
  const code = (c: unknown, s: unknown = settings) => gas.checkClaims(c, s, now).error.code;
  assert.equal(code(claims({ email: 'stranger@example.com' })), 'NOT_A_MEMBER');
  assert.equal(code(claims({ email_verified: 'false' })), 'NOT_A_MEMBER');
  assert.equal(code(claims({ aud: 'other.apps.googleusercontent.com' })), 'BAD_TOKEN');
  assert.equal(code(claims({ iss: 'evil.example.com' })), 'BAD_TOKEN');
  assert.equal(code(claims({ exp: String(now - 1) })), 'BAD_TOKEN');
  assert.equal(code(null), 'BAD_TOKEN');
  assert.equal(code(claims(), { ...settings, google_client_id: '' }), 'BAD_TOKEN');
  // Blank member 2 email must not let an account with no email through.
  assert.equal(code(claims({ email: '' }), { ...settings, member_2_email: '' }), 'NOT_A_MEMBER');
});

test('tokenCacheSeconds: until 30 s before exp, capped at 6 h, 0 when expired', () => {
  assert.equal(gas.tokenCacheSeconds(now + 3600, now), 3570);
  assert.equal(gas.tokenCacheSeconds(now + 100000, now), 21600);
  assert.equal(gas.tokenCacheSeconds(now + 10, now), 0);
  assert.equal(gas.tokenCacheSeconds('garbage', now), 0);
});

test('bytesToHex handles signed bytes from Utilities.computeDigest', () => {
  assert.equal(gas.bytesToHex([0, 15, 16, -1, -128, 127]), '000f10ff807f');
});

test('newUlid: 26 Crockford chars, time-sortable', () => {
  const a = gas.newUlid(1_700_000_000_000, () => 0.5);
  const b = gas.newUlid(1_700_000_000_001, () => 0);
  assert.match(a, /^[0-9A-HJKMNP-TV-Z]{26}$/);
  assert.ok(a.slice(0, 10) < b.slice(0, 10));
});

test('test row lines up with the Receipts header and carries zero money', () => {
  const row = gas.buildTestReceiptRow('ID1', new Date(Date.UTC(2026, 9, 11, 12)), { name: 'Ann', email: 'ann@example.com' });
  const header = gas.expectedHeaders('Receipts', settings);
  assert.equal(row.length, header.length);
  const at = (h: string) => row[header.indexOf(h)];
  assert.equal(at('Receipt ID'), 'ID1');
  assert.equal(at('Total'), 0);
  assert.equal(at('Ann share') + at('Bo share'), at('Total'));
  assert.equal(at('Added by'), 'ann@example.com');
  assert.equal(at('Added at'), '2026-10-11T12:00:00.000Z');
});

test('Settings defaults and parsing', () => {
  const rows = gas.DEFAULT_SETTINGS.map((r: unknown[]) => [...r]);
  const s = gas.settingsFromRows([...rows, ['', 'ignored', '']]);
  assert.equal(s.schema_version, 1);
  assert.equal(s.member_1_email, '');
  assert.equal(gas.settingsProblems(s).length, 2);
  assert.match(gas.settingsProblems({ ...settings, schema_version: 2 })[0], /newer/);
  assert.equal(gas.settingsProblems(settings).length, 0);
  assert.equal(gas.DEFAULT_CATEGORIES.length, 12);
  assert.equal(gas.columnLetter(27), 'AA');
});
