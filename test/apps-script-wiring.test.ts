// Runs all of apps-script/*.js against small in-memory fakes of SpreadsheetApp, CacheService, UrlFetchApp,
// LockService, Utilities and ContentService. This checks OUR wiring (setup -> doPost -> lock -> header check),
// not Google's behaviour: the real services are only exercised by the owner's setup and the M0 spikes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import vm from 'node:vm';

type Grid = unknown[][];

function fakeSheet(name: string) {
  const grid: Grid = [];
  const lastRow = () => {
    for (let r = grid.length - 1; r >= 0; r--) if ((grid[r] ?? []).some((v) => v !== '' && v != null)) return r + 1;
    return 0;
  };
  const lastCol = () => Math.max(0, ...grid.map((row) => {
    for (let c = (row ?? []).length - 1; c >= 0; c--) if (row[c] !== '' && row[c] != null) return c + 1;
    return 0;
  }));
  const range = (r: number, c: number, nr: number, nc: number) => {
    const self = {
      getValues: () => Array.from({ length: nr }, (_, i) => Array.from({ length: nc }, (_, j) => grid[r - 1 + i]?.[c - 1 + j] ?? '')),
      getDisplayValues: () => self.getValues().map((row) => row.map((v) => (v instanceof Date ? v.toDateString() : String(v)))),
      setValues: (vals: Grid) => {
        assert.equal(vals.length, nr, 'setValues row count');
        vals.forEach((row, i) => {
          assert.equal(row.length, nc, 'setValues column count');
          row.forEach((v, j) => { (grid[r - 1 + i] ??= [])[c - 1 + j] = v; });
        });
        return self;
      },
      clearContent: () => { for (let i = 0; i < nr; i++) for (let j = 0; j < nc; j++) if (grid[r - 1 + i]) grid[r - 1 + i][c - 1 + j] = ''; return self; },
      setFontWeight: () => self, setBackground: () => self, setNumberFormat: () => self,
    };
    return self;
  };
  return {
    name, grid,
    getName: () => name,
    getLastRow: lastRow,
    getLastColumn: lastCol,
    getMaxColumns: () => 26,
    getRange: (a: number | string, b?: number, c = 1, d = 1) => (typeof a === 'string' ? range(2, 1, 1, 1) : range(a, b!, c, d)),
    setFrozenRows: () => undefined,
  };
}

function makeGoogle(tokeninfo: Record<string, Record<string, unknown>>) {
  const sheets = [fakeSheet('Sheet1')];
  const ss = {
    getSheetByName: (n: string) => sheets.find((s) => s.name === n) ?? null,
    insertSheet: (n: string) => { const s = fakeSheet(n); sheets.push(s); return s; },
    getSheets: () => sheets,
    deleteSheet: (s: unknown) => { sheets.splice(sheets.indexOf(s as never), 1); },
  };
  const cache = new Map<string, string>();
  const calls = { tokeninfo: 0, locks: 0, unlocks: 0 };
  const ctx = vm.createContext({
    console: { log: () => undefined, error: () => undefined },
    SpreadsheetApp: { getActiveSpreadsheet: () => ss, flush: () => undefined },
    CacheService: { getScriptCache: () => ({ get: (k: string) => cache.get(k) ?? null, put: (k: string, v: string) => { cache.set(k, v); } }) },
    UrlFetchApp: {
      fetch: (url: string) => {
        calls.tokeninfo++;
        const token = decodeURIComponent(url.split('id_token=')[1]);
        const info = tokeninfo[token];
        return { getResponseCode: () => (info ? 200 : 400), getContentText: () => JSON.stringify(info ?? { error: 'invalid_token' }) };
      },
    },
    LockService: { getScriptLock: () => ({ tryLock: () => { calls.locks++; return true; }, releaseLock: () => { calls.unlocks++; } }) },
    Utilities: {
      DigestAlgorithm: { SHA_256: 'sha256' }, Charset: { UTF_8: 'utf8' },
      computeDigest: (_a: string, s: string) => [...createHash('sha256').update(s, 'utf8').digest()].map((b) => (b > 127 ? b - 256 : b)),
    },
    ContentService: {
      MimeType: { JSON: 'application/json' },
      createTextOutput: (text: string) => ({ text, setMimeType(m: string) { return { text, mime: m }; } }),
    },
  });
  const dir = new URL('../apps-script/', import.meta.url);
  for (const f of readdirSync(dir).filter((f) => f.endsWith('.js'))) vm.runInContext(readFileSync(new URL(f, dir), 'utf8'), ctx);
  const gas = ctx as any;
  const post = (body: unknown) => {
    const out = gas.doPost({ postData: { contents: typeof body === 'string' ? body : JSON.stringify(body), type: 'text/plain' } });
    assert.equal(out.mime, 'application/json');
    return JSON.parse(out.text);
  };
  return { gas, ss, sheets, calls, post };
}

const exp = String(Math.floor(Date.now() / 1000) + 3600);
const CLIENT = 'cid.apps.googleusercontent.com';
const TOKENS = {
  'tok-member': { aud: CLIENT, iss: 'accounts.google.com', exp, email: 'ann@example.com', email_verified: 'true' },
  'tok-stranger': { aud: CLIENT, iss: 'accounts.google.com', exp, email: 'eve@example.com', email_verified: 'true' },
};

function fillSettings(g: ReturnType<typeof makeGoogle>) {
  const s = g.ss.getSheetByName('Settings')!;
  const set = (key: string, value: string) => { s.grid.find((r) => r[0] === key)![1] = value; };
  set('member_1_name', 'Ann'); set('member_1_email', 'ann@example.com');
  set('member_2_name', 'Bo'); set('member_2_email', 'bo@example.com');
  set('google_client_id', CLIENT);
}

test('before setup(): whoami answers SCHEMA_MISMATCH as JSON', () => {
  const g = makeGoogle(TOKENS);
  const r = g.post({ id_token: 'tok-member', action: 'whoami' });
  assert.equal(r.error.code, 'SCHEMA_MISMATCH');
  assert.match(r.error.message, /setup\(\)/);
});

test('setup() creates four tabs with headers, seeds Categories, drops Sheet1, and is safe to re-run', () => {
  const g = makeGoogle(TOKENS);
  g.gas.setup();
  assert.deepEqual(g.sheets.map((s) => s.name).sort(), ['Categories', 'Items', 'Receipts', 'Settings']);
  assert.equal(g.ss.getSheetByName('Receipts')!.grid[0][8], 'Member 1 share');
  assert.equal(g.ss.getSheetByName('Categories')!.getLastRow(), 13);
  assert.equal(g.ss.getSheetByName('Settings')!.getLastRow(), 12);

  fillSettings(g);
  const log = g.gas.setup();
  assert.equal(g.ss.getSheetByName('Receipts')!.grid[0][8], 'Ann share', 'empty tabs get relabelled with member names');
  assert.equal(g.ss.getSheetByName('Items')!.grid[0][12], 'Bo share');
  assert.equal(g.ss.getSheetByName('Categories')!.getLastRow(), 13, 'categories not duplicated');
  assert.equal(g.ss.getSheetByName('Settings')!.getLastRow(), 12, 'settings not duplicated');
  assert.match(log, /Settings look complete/);
});

test('whoami: member gets their identity; second call is a token-cache hit with no extra tokeninfo call', () => {
  const g = makeGoogle(TOKENS);
  g.gas.setup(); fillSettings(g); g.gas.setup();
  const first = g.post({ id_token: 'tok-member', action: 'whoami' });
  assert.deepEqual(first, { ok: true, data: { email: 'ann@example.com', name: 'Ann', member_index: 1, token_cache: 'miss' } });
  const second = g.post({ id_token: 'tok-member', action: 'whoami', payload: {} });
  assert.equal(second.data.token_cache, 'hit');
  assert.equal(g.calls.tokeninfo, 1);
});

test('non-member gets NOT_A_MEMBER; a token Google rejects gets BAD_TOKEN; unknown action gets BAD_REQUEST', () => {
  const g = makeGoogle(TOKENS);
  g.gas.setup(); fillSettings(g);
  assert.equal(g.post({ id_token: 'tok-stranger', action: 'whoami' }).error.code, 'NOT_A_MEMBER');
  assert.equal(g.post({ id_token: 'forged', action: 'whoami' }).error.code, 'BAD_TOKEN');
  assert.equal(g.post({ id_token: 'tok-member', action: 'receipts.nuke' }).error.code, 'BAD_REQUEST');
  assert.equal(g.post('not json').error.code, 'BAD_REQUEST');
});

test('test.add_row appends under the lock; an edited header gives SCHEMA_MISMATCH and writes nothing', () => {
  const g = makeGoogle(TOKENS);
  g.gas.setup(); fillSettings(g); g.gas.setup();
  const receipts = g.ss.getSheetByName('Receipts')!;

  const r1 = g.post({ id_token: 'tok-member', action: 'test.add_row' });
  assert.equal(r1.ok, true);
  assert.equal(r1.data.row_number, 2);
  assert.equal(receipts.grid[1][0], r1.data.receipt_id);
  assert.equal(receipts.grid[1][2], 'TEST ROW (M0)');
  assert.equal(receipts.grid[1][15], 'ann@example.com');
  assert.equal(g.post({ id_token: 'tok-member', action: 'test.add_row' }).data.row_number, 3);
  assert.equal(g.calls.locks, 2);
  assert.equal(g.calls.unlocks, 2);

  receipts.grid[0][2] = 'Shop';
  const r3 = g.post({ id_token: 'tok-member', action: 'test.add_row' });
  assert.equal(r3.error.code, 'SCHEMA_MISMATCH');
  assert.match(r3.error.message, /column C should be "Store" but is "Shop"/);
  assert.equal(receipts.getLastRow(), 3, 'nothing written');
  assert.equal(g.calls.unlocks, 3, 'lock released on the error path too');
});

test('a thrown error inside an action still comes back as JSON with code INTERNAL', () => {
  const g = makeGoogle(TOKENS);
  g.gas.setup(); fillSettings(g);
  g.gas.SpreadsheetApp.getActiveSpreadsheet = () => { throw new Error('boom'); };
  const r = g.post({ id_token: 'tok-member', action: 'whoami' });
  assert.equal(r.error.code, 'INTERNAL');
  assert.match(r.error.message, /boom/);
});

test('doGet answers JSON without sign-in', () => {
  const g = makeGoogle(TOKENS);
  assert.equal(JSON.parse(g.gas.doGet().text).data.service, 'receipt-logger');
});
