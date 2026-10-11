/**
 * Web app entry points for the Receipt Logger API (DATA.md section 4).
 * Deployed as: execute as the owner, access "Anyone". The id token check below guards every action.
 * The page POSTs with Content-Type text/plain so the browser sends no CORS preflight.
 */

var TOKENINFO_URL = 'https://oauth2.googleapis.com/tokeninfo?id_token=';
var LOCK_WAIT_MS = 30000;

/** Every POST: parse the envelope, verify the caller, run the action, always answer JSON. */
function doPost(e) {
  var result;
  try {
    var text = e && e.postData ? e.postData.contents : '';
    var envelope = parseEnvelope(text);
    result = envelope.ok ? route_(envelope.value) : envelope;
  } catch (err) {
    console.error(err && err.stack ? err.stack : err);
    result = errorResponse('INTERNAL', 'Unexpected script error: ' + (err && err.message ? err.message : String(err)));
  }
  return json_(result);
}

/** A GET from a browser tab: proves the URL is live without needing sign-in. Reveals nothing. */
function doGet() {
  return json_(okResponse({ service: 'receipt-logger', schema_version: SCHEMA_VERSION, hint: 'POST a JSON envelope as text/plain.' }));
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

var ACTIONS_ = {
  'whoami': actionWhoami_,
  'test.add_row': actionAddTestRow_
};

function route_(req) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) throw new Error('This script is not attached to the Receipt Logger Sheet.');

  var settingsResult = readSettings_(ss);
  if (!settingsResult.ok) return settingsResult;
  var settings = settingsResult.settings;

  var verified = verifyIdToken_(req.id_token);
  if (!verified.claims) return errorResponse('BAD_TOKEN', 'Sign-in could not be verified by Google. Sign in again.');
  var auth = checkClaims(verified.claims, settings, Math.floor(Date.now() / 1000));
  if (!auth.ok) return auth;

  var action = ACTIONS_[req.action];
  if (!action) return errorResponse('BAD_REQUEST', 'Unknown action "' + req.action + '".');
  return action({ ss: ss, settings: settings, member: auth.member, payload: req.payload, tokenCache: verified.cache });
}

/** Read the Settings tab after checking its header. Returns { ok: true, settings } or an error response. */
function readSettings_(ss) {
  var sheet = ss.getSheetByName(TAB_SETTINGS);
  if (!sheet) return errorResponse('SCHEMA_MISMATCH', 'The Sheet has no "Settings" tab. The owner needs to run setup() once.');
  var lastRow = sheet.getLastRow();
  var values = sheet.getRange(1, 1, Math.max(lastRow, 1), SETTINGS_HEADERS.length).getValues();
  var headerError = checkHeaders(TAB_SETTINGS, values[0], SETTINGS_HEADERS);
  if (headerError) return headerError;
  var settings = settingsFromRows(values.slice(1));
  if (Number(settings.schema_version) > SCHEMA_VERSION) {
    return errorResponse('SCHEMA_MISMATCH', 'The Sheet is schema_version ' + settings.schema_version +
      ' but this script only knows ' + SCHEMA_VERSION + '. Deploy the newer script.');
  }
  return { ok: true, settings: settings };
}

/**
 * Verify a Google id token with tokeninfo, caching the claims until shortly before the token expires,
 * so each sign-in costs one tokeninfo call (RISKS.md T2). Claims are re-checked on every request.
 * Returns { claims, cache: 'hit' | 'miss' }, with claims null when Google rejects the token.
 */
function verifyIdToken_(idToken) {
  var cache = CacheService.getScriptCache();
  var key = 'idtok:' + bytesToHex(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, idToken, Utilities.Charset.UTF_8));
  var cached = cache.get(key);
  if (cached) return { claims: JSON.parse(cached), cache: 'hit' };

  var resp = UrlFetchApp.fetch(TOKENINFO_URL + encodeURIComponent(idToken), { muteHttpExceptions: true });
  if (resp.getResponseCode() !== 200) return { claims: null, cache: 'miss' };
  var info = JSON.parse(resp.getContentText());
  var claims = {
    aud: info.aud, iss: info.iss, exp: info.exp, sub: info.sub,
    email: info.email, email_verified: info.email_verified, name: info.name
  };
  var ttl = tokenCacheSeconds(claims.exp, Math.floor(Date.now() / 1000));
  if (ttl > 0) cache.put(key, JSON.stringify(claims), ttl);
  return { claims: claims, cache: 'miss' };
}

/** whoami: who the script thinks is calling. Also warms the token cache. */
function actionWhoami_(ctx) {
  return okResponse({
    email: ctx.member.email,
    name: ctx.member.name,
    member_index: ctx.member.member_index,
    token_cache: ctx.tokenCache
  });
}

/** M0 only: append one zero-dollar test row to Receipts, under the script lock, after the header check. */
function actionAddTestRow_(ctx) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(LOCK_WAIT_MS)) {
    return errorResponse('INTERNAL', 'Another save is still running. Try again in a few seconds.');
  }
  try {
    var sheet = ctx.ss.getSheetByName(TAB_RECEIPTS);
    if (!sheet) return errorResponse('SCHEMA_MISMATCH', 'The Sheet has no "Receipts" tab. The owner needs to run setup() once.');
    var expected = expectedHeaders(TAB_RECEIPTS, ctx.settings);
    var width = Math.max(sheet.getLastColumn(), expected.length);
    var header = sheet.getRange(1, 1, 1, width).getDisplayValues()[0];
    var headerError = checkHeaders(TAB_RECEIPTS, header, expected);
    if (headerError) return headerError;

    var receiptId = newUlid(Date.now(), Math.random);
    var row = buildTestReceiptRow(receiptId, new Date(), ctx.member);
    var rowNumber = sheet.getLastRow() + 1;
    sheet.getRange(rowNumber, 1, 1, row.length).setValues([row]);
    SpreadsheetApp.flush();
    return okResponse({ receipt_id: receiptId, row_number: rowNumber, tab: TAB_RECEIPTS });
  } finally {
    lock.releaseLock();
  }
}
