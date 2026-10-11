import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildEnvelope, checkConfig, parseApiResponse } from '../src/api.ts';
import { decodeJwtPayload } from '../src/token.ts';
import { sniffImageFormat, spike4Verdict } from '../src/files.ts';
import { APPS_SCRIPT_URL, GOOGLE_CLIENT_ID } from '../src/config.ts';

test('committed placeholders read as "not configured"', () => {
  const state = checkConfig(GOOGLE_CLIENT_ID, APPS_SCRIPT_URL);
  assert.equal(state.configured, false);
  if (!state.configured) assert.equal(state.missing.length, 2);
});

test('real-shaped values read as configured', () => {
  const state = checkConfig('1234-abc.apps.googleusercontent.com', 'https://script.google.com/macros/s/AKfy_cb-123/exec');
  assert.deepEqual(state, { configured: true });
});

test('a /dev URL or a missing /exec is not accepted', () => {
  assert.equal(checkConfig('1-a.apps.googleusercontent.com', 'https://script.google.com/macros/s/AKfy/dev').configured, false);
});

test('envelope matches DATA.md section 4', () => {
  assert.deepEqual(JSON.parse(buildEnvelope('tok', 'whoami')), { id_token: 'tok', action: 'whoami', payload: {} });
});

test('parseApiResponse: ok, error, HTML page, wrong shape', () => {
  assert.deepEqual(parseApiResponse('{"ok":true,"data":{"email":"a@b.c"}}'), { ok: true, data: { email: 'a@b.c' } });
  assert.deepEqual(parseApiResponse('{"ok":false,"error":{"code":"NOT_A_MEMBER","message":"no"}}'),
    { ok: false, error: { code: 'NOT_A_MEMBER', message: 'no' } });
  const html = parseApiResponse('<!DOCTYPE html><html><body>TypeError: x is not a function</body></html>');
  assert.equal(html.ok, false);
  if (!html.ok) assert.equal(html.error.code, 'NOT_JSON');
  const odd = parseApiResponse('{"hello":1}');
  assert.equal(odd.ok, false);
  if (!odd.ok) assert.equal(odd.error.code, 'BAD_ENVELOPE');
});

test('decodeJwtPayload reads base64url claims, rejects junk', () => {
  const payload = Buffer.from(JSON.stringify({ email: 'ü@example.com', exp: 123 })).toString('base64url');
  assert.deepEqual(decodeJwtPayload(`h.${payload}.s`), { email: 'ü@example.com', exp: 123 });
  assert.equal(decodeJwtPayload('not-a-jwt'), null);
  assert.equal(decodeJwtPayload('a.!!!.c'), null);
});

test('sniffImageFormat recognises JPEG, PNG, WebP and HEIC by magic bytes', () => {
  const b = (...xs: (number | string)[]) => new Uint8Array(xs.flatMap((x) => typeof x === 'string' ? [...x].map((c) => c.charCodeAt(0)) : [x]));
  assert.equal(sniffImageFormat(b(0xff, 0xd8, 0xff, 0xe0)), 'jpeg');
  assert.equal(sniffImageFormat(b(0x89, 'PNG', 0x0d, 0x0a)), 'png');
  assert.equal(sniffImageFormat(b('RIFF', 0, 0, 0, 0, 'WEBP')), 'webp');
  assert.equal(sniffImageFormat(b(0, 0, 0, 0x18, 'ftyp', 'heic')), 'heic');
  assert.equal(sniffImageFormat(b(0, 0, 0, 0x18, 'ftyp', 'mif1')), 'heic');
  assert.equal(sniffImageFormat(b(1, 2, 3)), 'unknown');
});

test('spike4Verdict fails HEIC even when the browser labels it image/jpeg', () => {
  assert.equal(spike4Verdict('image/jpeg', 'heic').pass, false);
  assert.equal(spike4Verdict('image/jpeg', 'jpeg').pass, true);
});
