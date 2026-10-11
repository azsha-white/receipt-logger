/**
 * setup(): run once by the owner from the Apps Script editor (Run > setup).
 * Creates the four tabs with the DATA.md section 2 headers and seeds Settings and Categories.
 *
 * Safe to run again: it never deletes data. On a second run it adds any missing Settings keys and,
 * for Receipts and Items tabs that have no data rows yet, rewrites the header row so the member
 * names typed into Settings appear in the "<name> share" columns.
 */
function setup() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) throw new Error('Open this script from the Receipt Logger Sheet (Extensions > Apps Script) and run setup() again.');
  var log = [];

  // 1. Settings first: the other headers depend on the member names in it.
  var settingsSheet = ensureTab_(ss, TAB_SETTINGS, log);
  if (settingsSheet.getLastRow() === 0) {
    writeRows_(settingsSheet, [SETTINGS_HEADERS].concat(DEFAULT_SETTINGS));
    log.push('Settings: created with default keys.');
  } else {
    var current = settingsSheet.getRange(1, 1, settingsSheet.getLastRow(), SETTINGS_HEADERS.length).getValues();
    var headerError = checkHeaders(TAB_SETTINGS, current[0], SETTINGS_HEADERS);
    if (headerError) throw new Error(headerError.error.message);
    var have = settingsFromRows(current.slice(1));
    var missing = DEFAULT_SETTINGS.filter(function (r) { return !(r[0] in have); });
    if (missing.length) {
      settingsSheet.getRange(settingsSheet.getLastRow() + 1, 1, missing.length, 3).setValues(missing);
      log.push('Settings: added missing keys ' + missing.map(function (r) { return r[0]; }).join(', ') + '.');
    } else {
      log.push('Settings: all keys present, values left as they are.');
    }
  }
  styleHeader_(settingsSheet, SETTINGS_HEADERS.length);
  var settings = settingsFromRows(settingsSheet.getRange(1, 1, settingsSheet.getLastRow(), 3).getValues().slice(1));

  // 2. Receipts and Items: header row from the member names.
  [TAB_RECEIPTS, TAB_ITEMS].forEach(function (tab) {
    var sheet = ensureTab_(ss, tab, log);
    var expected = expectedHeaders(tab, settings);
    if (sheet.getLastRow() <= 1) {
      sheet.getRange(1, 1, 1, Math.max(sheet.getMaxColumns(), expected.length)).clearContent();
      writeRows_(sheet, [expected]);
      log.push(tab + ': header row written.');
    } else {
      var actual = sheet.getRange(1, 1, 1, Math.max(sheet.getLastColumn(), expected.length)).getDisplayValues()[0];
      var err = checkHeaders(tab, actual, expected);
      log.push(tab + ': has data rows, header left alone' + (err ? ' (WARNING: ' + err.error.message + ')' : ' (header OK).'));
    }
    styleHeader_(sheet, expected.length);
  });
  formatMoneyColumns_(ss.getSheetByName(TAB_RECEIPTS), ['D', 'E', 'F', 'I', 'J']);
  formatMoneyColumns_(ss.getSheetByName(TAB_ITEMS), ['H', 'I', 'L', 'M']);

  // 3. Categories: seed the defaults only into an empty tab.
  var catSheet = ensureTab_(ss, TAB_CATEGORIES, log);
  if (catSheet.getLastRow() === 0) {
    writeRows_(catSheet, [CATEGORIES_HEADERS].concat(DEFAULT_CATEGORIES));
    log.push('Categories: seeded ' + DEFAULT_CATEGORIES.length + ' defaults.');
  } else {
    log.push('Categories: already has rows, left alone.');
  }
  styleHeader_(catSheet, CATEGORIES_HEADERS.length);

  // 4. Remove the empty "Sheet1" a new spreadsheet starts with.
  var blank = ss.getSheetByName('Sheet1');
  if (blank && blank.getLastRow() === 0 && ss.getSheets().length > 1) {
    ss.deleteSheet(blank);
    log.push('Removed the empty Sheet1 tab.');
  }

  var todo = settingsProblems(settings);
  log.push(todo.length ? 'Still to fill in on the Settings tab: ' + todo.join(' ') : 'Settings look complete.');
  log.forEach(function (line) { console.log(line); });
  return log.join('\n');
}

function ensureTab_(ss, name, log) {
  var sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    log.push(name + ': tab created.');
  }
  return sheet;
}

function writeRows_(sheet, rows) {
  sheet.getRange(1, 1, rows.length, rows[0].length).setValues(rows);
}

function styleHeader_(sheet, width) {
  sheet.setFrozenRows(1);
  sheet.getRange(1, 1, 1, width).setFontWeight('bold').setBackground('#eef0ea');
}

function formatMoneyColumns_(sheet, letters) {
  letters.forEach(function (col) {
    sheet.getRange(col + '2:' + col).setNumberFormat('0.00');
  });
}
