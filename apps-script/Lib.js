/**
 * Pure logic for the Receipt Logger API: no Google services are used in this file,
 * so it can be unit-checked with node (see test/apps-script-lib.test.ts).
 * Contract: .forge design DATA.md sections 2, 4 and 6.
 *
 * Apps Script loads every file into one global scope, so these are plain globals.
 */

var SCHEMA_VERSION = 1;

var TAB_RECEIPTS = 'Receipts';
var TAB_ITEMS = 'Items';
var TAB_SETTINGS = 'Settings';
var TAB_CATEGORIES = 'Categories';

var SETTINGS_HEADERS = ['Key', 'Value', 'Notes'];
var CATEGORIES_HEADERS = ['Name', 'Keywords', 'Active'];

/** Default Settings rows: [key, value, note]. Values left blank are filled in by the owner. */
var DEFAULT_SETTINGS = [
  ['schema_version', SCHEMA_VERSION, 'Do not edit. The script refuses a newer version than it knows.'],
  ['member_1_name', '', 'First name shown in the app and in column headers. Member 1 gets the odd cent on even splits.'],
  ['member_1_email', '', 'Google account email of member 1 (the sign-in allow-list).'],
  ['member_2_name', '', 'First name of member 2.'],
  ['member_2_email', '', 'Google account email of member 2.'],
  ['photo_folder_id', '', 'Drive folder id for receipt photos (used from M1).'],
  ['google_client_id', '', 'OAuth client id of the sign-in button. Must match the web page config.'],
  ['reader_model', 'claude-haiku-5-5', 'Default receipt reader (used from M1).'],
  ['reader_retry_model', 'claude-sonnet-5-5', 'Retry reader, only when validation fails (used from M1).'],
  ['extract_rate_limit_per_hour', 60, 'Receipt reads per user per hour (used from M1).'],
  ['allowed_origin', 'https://azsha-white.github.io', 'Informational only; sign-in is the real guard.']
];

/** Default Categories rows: [name, keywords, active]. */
var DEFAULT_CATEGORIES = [
  ['Groceries', 'supermarket, grocery, produce, dairy, meat, bakery', true],
  ['Dining', 'restaurant, cafe, coffee, takeout, delivery, bar', true],
  ['Household', 'cleaning, paper towels, detergent, hardware, kitchen', true],
  ['Health', 'pharmacy, prescription, vitamins, doctor, dental', true],
  ['Transport', 'gas, fuel, parking, toll, transit, rideshare', true],
  ['Entertainment', 'movies, games, streaming, books, events', true],
  ['Clothing', 'apparel, shoes, clothes', true],
  ['Kids', 'school, toys, diapers, childcare', true],
  ['Pets', 'pet food, vet, litter', true],
  ['Gifts', 'gift, gift card, flowers', true],
  ['Utilities', 'electric, water, internet, phone', true],
  ['Other', '', true]
];

var ERROR_CODES = [
  'BAD_TOKEN', 'NOT_A_MEMBER', 'SCHEMA_MISMATCH', 'MONEY_INVARIANT', 'NOT_FOUND',
  'RATE_LIMITED', 'READER_FAILED', 'PHOTO_FAILED', 'BAD_REQUEST',
  // Not in DATA.md section 4: an unexpected script error, returned as JSON instead of Google's HTML error page.
  'INTERNAL'
];

/** Member names from Settings, with neutral fallbacks until the owner fills them in. */
function memberNames(settings) {
  var n1 = String((settings && settings.member_1_name) || '').trim();
  var n2 = String((settings && settings.member_2_name) || '').trim();
  return [n1 || 'Member 1', n2 || 'Member 2'];
}

function receiptsHeaders(names) {
  return ['Receipt ID', 'Date', 'Store', 'Total', 'Tax', 'Tip', 'Paid by', 'Split rule',
    names[0] + ' share', names[1] + ' share', 'Items', 'Categories', 'Photo', 'Photo file ID',
    'Notes', 'Added by', 'Added at', 'Updated at'];
}

function itemsHeaders(names) {
  return ['Item ID', 'Receipt ID', 'Date', 'Store', 'Line', 'Description', 'Qty', 'Unit price',
    'Amount', 'Category', 'Assigned to', names[0] + ' share', names[1] + ' share'];
}

/** Expected header row for each tab, given the Settings map. */
function expectedHeaders(tabName, settings) {
  var names = memberNames(settings);
  if (tabName === TAB_RECEIPTS) return receiptsHeaders(names);
  if (tabName === TAB_ITEMS) return itemsHeaders(names);
  if (tabName === TAB_SETTINGS) return SETTINGS_HEADERS.slice();
  if (tabName === TAB_CATEGORIES) return CATEGORIES_HEADERS.slice();
  throw new Error('Unknown tab: ' + tabName);
}

function okResponse(data) {
  return { ok: true, data: data === undefined ? {} : data };
}

function errorResponse(code, message) {
  return { ok: false, error: { code: code, message: message } };
}

/**
 * Parse the request body (DATA.md section 4 envelope).
 * Returns { ok: true, value: { id_token, action, payload } } or an error response with BAD_REQUEST.
 */
function parseEnvelope(text) {
  if (typeof text !== 'string' || text.trim() === '') {
    return errorResponse('BAD_REQUEST', 'Empty request body.');
  }
  var body;
  try {
    body = JSON.parse(text);
  } catch (e) {
    return errorResponse('BAD_REQUEST', 'Request body is not valid JSON.');
  }
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    return errorResponse('BAD_REQUEST', 'Request body must be a JSON object.');
  }
  if (typeof body.action !== 'string' || body.action === '') {
    return errorResponse('BAD_REQUEST', 'Missing "action".');
  }
  if (typeof body.id_token !== 'string' || body.id_token === '') {
    return errorResponse('BAD_TOKEN', 'Missing "id_token". Sign in again.');
  }
  var payload = body.payload === undefined || body.payload === null ? {} : body.payload;
  if (typeof payload !== 'object' || Array.isArray(payload)) {
    return errorResponse('BAD_REQUEST', '"payload" must be an object.');
  }
  return { ok: true, value: { id_token: body.id_token, action: body.action, payload: payload } };
}

/**
 * Compare a sheet's row 1 to the expected labels (DATA.md section 2, Q5).
 * Trailing blank cells are ignored; labels are compared after trimming.
 * Returns null when they match, or a SCHEMA_MISMATCH error response.
 */
function checkHeaders(tabName, actualRow, expected) {
  var actual = (actualRow || []).map(function (v) { return String(v === null || v === undefined ? '' : v).trim(); });
  while (actual.length && actual[actual.length - 1] === '') actual.pop();
  for (var i = 0; i < Math.max(actual.length, expected.length); i++) {
    var want = expected[i] === undefined ? '' : expected[i];
    var got = actual[i] === undefined ? '' : actual[i];
    if (want !== got) {
      return errorResponse('SCHEMA_MISMATCH',
        'The "' + tabName + '" tab header changed: column ' + columnLetter(i + 1) + ' should be "' + want +
        '" but is "' + got + '". Undo the edit to row 1 (sorting and filtering are fine; renaming or moving header cells is not).');
    }
  }
  return null;
}

/** 1 -> A, 27 -> AA. */
function columnLetter(n) {
  var s = '';
  while (n > 0) {
    var m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

/** Settings tab rows (without the header) -> { key: value }. */
function settingsFromRows(rows) {
  var out = {};
  (rows || []).forEach(function (r) {
    var key = String(r[0] === null || r[0] === undefined ? '' : r[0]).trim();
    if (key) out[key] = r[1];
  });
  return out;
}

/** Problems with the Settings map that block sign-in, as plain sentences. Empty when ready. */
function settingsProblems(settings) {
  var problems = [];
  var v = Number(settings.schema_version);
  if (!(v >= 1)) problems.push('Settings has no valid schema_version.');
  else if (v > SCHEMA_VERSION) problems.push('Settings schema_version ' + v + ' is newer than this script knows (' + SCHEMA_VERSION + ').');
  if (!String(settings.google_client_id || '').trim()) problems.push('Settings google_client_id is empty.');
  if (!String(settings.member_1_email || '').trim()) problems.push('Settings member_1_email is empty.');
  return problems;
}

/**
 * Check verified tokeninfo claims against Settings (DATA.md section 6).
 * claims: the tokeninfo JSON (string fields, as Google returns them).
 * Returns { ok: true, member: { email, name, member_index } } or an error response.
 */
function checkClaims(claims, settings, nowSeconds) {
  if (!claims || typeof claims !== 'object') return errorResponse('BAD_TOKEN', 'Sign-in could not be verified. Sign in again.');
  var clientId = String(settings.google_client_id || '').trim();
  if (!clientId) return errorResponse('BAD_TOKEN', 'The Sheet\'s Settings tab has no google_client_id yet.');
  if (String(claims.aud) !== clientId) return errorResponse('BAD_TOKEN', 'This sign-in was made for a different app (client id mismatch).');
  if (claims.iss !== 'accounts.google.com' && claims.iss !== 'https://accounts.google.com') {
    return errorResponse('BAD_TOKEN', 'Sign-in token was not issued by Google.');
  }
  var exp = Number(claims.exp);
  if (!(exp > nowSeconds)) return errorResponse('BAD_TOKEN', 'Sign-in has expired. Sign in again.');
  if (!(claims.email_verified === true || claims.email_verified === 'true')) {
    return errorResponse('NOT_A_MEMBER', 'This Google account\'s email is not verified.');
  }
  var email = String(claims.email || '').trim().toLowerCase();
  var names = memberNames(settings);
  var emails = [settings.member_1_email, settings.member_2_email].map(function (e) {
    return String(e || '').trim().toLowerCase();
  });
  for (var i = 0; i < 2; i++) {
    if (email && emails[i] && email === emails[i]) {
      return { ok: true, member: { email: email, name: names[i], member_index: i + 1 } };
    }
  }
  return errorResponse('NOT_A_MEMBER', 'This Google account (' + email + ') is not a member of the household.');
}

/** Seconds a verified token may stay in CacheService: until 30 s before exp, capped at 6 h (the cache maximum). */
function tokenCacheSeconds(exp, nowSeconds) {
  var s = Math.floor(Number(exp) - nowSeconds - 30);
  if (!(s > 0)) return 0;
  return Math.min(s, 21600);
}

/** Signed byte array (as Utilities.computeDigest returns) -> lowercase hex. */
function bytesToHex(bytes) {
  var hex = '';
  for (var i = 0; i < bytes.length; i++) {
    var b = bytes[i] < 0 ? bytes[i] + 256 : bytes[i];
    hex += (b < 16 ? '0' : '') + b.toString(16);
  }
  return hex;
}

var ULID_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

/** ULID: 10 chars of millisecond time + 16 random chars, Crockford base32. randomFn returns [0, 1). */
function newUlid(nowMs, randomFn) {
  var t = Math.floor(nowMs);
  var timePart = '';
  for (var i = 0; i < 10; i++) {
    timePart = ULID_ALPHABET.charAt(t % 32) + timePart;
    t = Math.floor(t / 32);
  }
  var randPart = '';
  for (var j = 0; j < 16; j++) {
    randPart += ULID_ALPHABET.charAt(Math.floor(randomFn() * 32));
  }
  return timePart + randPart;
}

/**
 * One Receipts row for the M0 "add test row" action, in Receipts column order.
 * Total and shares are 0, so it cannot disturb any money total; the Store and Notes cells say it is a test.
 */
function buildTestReceiptRow(receiptId, now, member) {
  var iso = now.toISOString();
  var date = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return [
    receiptId, date, 'TEST ROW (M0)', 0, 0, 0, member.name, 'none', 0, 0, 0, '', '', '',
    'M0 skeleton test row. Safe to delete.', member.email, iso, iso
  ];
}
