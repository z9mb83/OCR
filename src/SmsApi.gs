/******************************************************
 * SMS API for the web dashboard ("Send next 100" button) - added 19 Nov 2026
 *
 * The SAME file goes into both Apps Script projects (Shaadi OCR and Property NeoDove).
 * Only SMS_API_BRAND differs: 'SB' in the Shaadi project, 'PE' in the Property project.
 *
 * It does NOT have its own sending logic: "sendnext" runs the sheet's existing
 * sendNextBatch_() (same as the menu Send Next 100), so every rule still applies:
 * never re-text a number, skip DND / not-in-use numbers, promotional only 9 AM - 9 PM,
 * one send at a time (script lock), nothing in Dry run mode.
 *
 * Setup (once per project):
 *   1. Paste this file as SmsApi.gs and set SMS_API_BRAND.
 *   2. In addSmsMenu_() add:  .addItem('Dashboard access key', 'smsApiCreateKey')
 *   3. Deploy → New deployment → Web app (Execute as: Me, Who has access: Anyone).
 *   4. Dashboard (Vercel) settings: SMS_<BRAND>_URL = the /exec link, SMS_<BRAND>_KEY = the access key.
 * Actions: status (GET), sendnext and bulkadd (POST, upload from the dashboard).
 * Every request must carry ?key=<access key> (Script Property SMS_API_KEY); without it the answer is "unauthorized".
 ******************************************************/

const SMS_API_BRAND = 'SB';   // 'SB' = Shaadi OCR project, 'PE' = Property NeoDove project
const SMS_API_LIMIT = 100;

/** Which tab, template and "sent" label the dashboard uses - the same as the sheet's own Send Next 100. */
function smsApiTarget_() {
  if (SMS_API_BRAND === 'SB') {
    return { sh: getExactWorksheet_(), tpl: smsDefaultTemplate_('Shaadi – Outreach'), okLabel: 'Accepted by Telinfy' };
  }
  const list = loadTemplates_();
  return { sh: getExactWorksheet_(), tpl: list.find(t => t.label === 'PEG') || list[0], okLabel: 'Sent (queued)' };
}

function doPost(e) {
  return smsApiAnswer_(e);
}

function doGet(e) {
  return smsApiAnswer_(e);
}

function smsApiAnswer_(e) {
  let out;
  try {
    const p = (e && e.parameter) || {};
    const key = PropertiesService.getScriptProperties().getProperty('SMS_API_KEY');
    if (!key || String(p.key || '') !== key) {
      out = { ok: false, error: 'unauthorized' };
    } else if (p.action === 'status') {
      out = { ok: true, status: smsApiStatus_() };
    } else if (p.action === 'sendnext') {
      if (!e.postData) throw new Error('Use POST to send.');
      out = smsApiSendNext_();
    } else if (p.action === 'bulkadd') {
      if (!e.postData) throw new Error('Use POST to upload.');
      out = smsApiBulkAdd_(JSON.parse(e.postData.contents || '{}'));
    } else {
      out = { ok: false, message: 'Unknown action.' };
    }
  } catch (err) {
    out = { ok: false, message: String(err && err.message || err).slice(0, 300) };
  }
  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
}

function smsApiPhones_(v) {
  return typeof extractIndianMobiles_ === 'function' ? extractIndianMobiles_(v) : [normalizeIndianMobile_(v)].filter(Boolean);
}

/** Read-only counts for the dashboard card. */
function smsApiStatus_() {
  const t = smsApiTarget_(), sh = t.sh;
  const cols = getCols_(sh), last = sh.getLastRow();
  const data = last > 1 ? sh.getRange(2, 1, last - 1, sh.getLastColumn()).getValues() : [];
  const day = d => Utilities.formatDate(d, 'Asia/Kolkata', 'yyyy-MM-dd');
  const today = day(new Date());
  let waiting = 0, sentToday = 0, sent = 0, failed = 0, skipped = 0;
  data.forEach(r => {
    const st = String(r[cols.status - 1] || '').trim();
    if ((st === '' || st === 'Dry run OK') && smsApiPhones_(r[cols.phone - 1]).length) waiting++;
    if (/^(Sent|Accepted)/.test(st)) {
      sent++;
      const at = r[cols.time - 1];
      if (at instanceof Date && day(at) === today) sentToday++;
    } else if (/^Failed/.test(st)) failed++;
    else if (/^Skipped/.test(st)) skipped++;
  });
  return {
    brand: SMS_API_BRAND, sheet: SpreadsheetApp.getActive().getName(), template: t.tpl ? t.tpl.label : '',
    live: !isDryRun_(), window: t.tpl ? withinPromoWindow_(t.tpl) : false, limit: SMS_API_LIMIT,
    waiting: waiting, sentToday: sentToday, sent: sent, failed: failed, skipped: skipped
  };
}

/** Runs the sheet's own Send Next 100 and reports what changed. */
function smsApiSendNext_() {
  const t = smsApiTarget_();
  if (!t.sh) throw new Error('Data tab not found.');
  if (!t.tpl) throw new Error('No active SMS template (SMS → Templates).');
  if (isDryRun_()) throw new Error('SMS is in DRY RUN mode, nothing would be sent. Switch to Live in the sheet: SMS → Mode: switch Live / Dry run.');
  if (!withinPromoWindow_(t.tpl)) throw new Error('Promotional SMS can only be sent 9 AM – 9 PM IST.');
  const cols = getCols_(t.sh), n = t.sh.getLastRow();
  const read = () => n > 1 ? t.sh.getRange(2, cols.status, n - 1, 1).getValues() : [];
  const before = read();
  sendNextBatch_(t.sh, t.tpl, SMS_API_LIMIT, t.okLabel);
  const after = read();
  let sent = 0, failed = 0, skipped = 0;
  const rows = [];
  after.forEach((a, i) => {
    const x = String(a[0] || ''), y = String(before[i] ? before[i][0] || '' : '');
    if (x === y) return;
    rows.push(i + 2);
    if (/^(Sent|Accepted)/.test(x)) sent++;
    else if (/^Failed/.test(x)) failed++;
    else if (/^Skipped/.test(x)) skipped++;
  });
  return {
    ok: true, sent: sent, failed: failed, skipped: skipped,
    firstRow: rows.length ? rows[0] : 0, lastRow: rows.length ? rows[rows.length - 1] : 0,
    status: smsApiStatus_()
  };
}

/** Menu SMS → Dashboard access key: makes the key and shows it once (copy it into Vercel as SMS_<BRAND>_KEY). */
function smsApiCreateKey() {
  const ui = SpreadsheetApp.getUi(), p = PropertiesService.getScriptProperties();
  if (p.getProperty('SMS_API_KEY') && ui.alert('Dashboard access key',
      'A key already exists. Replace it? The dashboard\'s Send SMS button stops working until you paste the new key into Vercel.',
      ui.ButtonSet.YES_NO) !== ui.Button.YES) return;
  const key = (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, '');
  p.setProperty('SMS_API_KEY', key);
  const html = HtmlService.createHtmlOutput(
    '<div style="font-family:Arial;font-size:13px">Copy this key into Vercel as <b>SMS_' + SMS_API_BRAND + '_KEY</b>. It is shown only now.<br><br>' +
    '<textarea style="width:100%;height:60px" readonly onclick="this.select()">' + key + '</textarea></div>').setWidth(460).setHeight(170);
  ui.showModalDialog(html, 'Dashboard access key');
}

/* ====== Upload from the dashboard (26 Nov 2026) ======
 * POST action=bulkadd, body {file, rows: [{phone, name}]}: new numbers are added BELOW the last row of the data tab
 * (A = "Upload: <file> (<date>)", B = name, Phone = the 10-digit number), so Send Next 100 and the automatic batches pick
 * them up. Existing rows are never changed. Skipped: numbers already anywhere in the tab, invalid numbers, repeats in the file.
 * The OCR ignores these rows (they have no image file ID).
 */
const SMS_API_MAX_UPLOAD = 20000;

function smsApiBulkAdd_(body) {
  const items = Array.isArray(body && body.rows) ? body.rows.slice(0, SMS_API_MAX_UPLOAD) : [];
  if (!items.length) return { ok: false, message: 'No phone numbers in the file.' };
  const label = 'Upload: ' + String(body.file || 'dashboard').slice(0, 80) + ' (' + Utilities.formatDate(new Date(), 'Asia/Kolkata', 'yyyy-MM-dd HH:mm') + ')';
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) return { ok: false, message: 'The sheet is busy (a send or another upload is running). Try again in a minute.' };
  try {
    const sh = smsApiTarget_().sh, cols = getCols_(sh), last = sh.getLastRow();
    const have = new Set(), seen = new Set(), names = [], phones = [];
    if (last > 1) sh.getRange(2, cols.phone, last - 1, 1).getValues().forEach(r => smsApiPhones_(r[0]).forEach(x => have.add(x)));
    let already = 0, invalid = 0, repeated = 0;
    items.forEach(it => {
      const p = smsApiPhones_(it && it.phone)[0];
      if (!p) { invalid++; return; }
      if (have.has(p)) { already++; return; }
      if (seen.has(p)) { repeated++; return; }
      seen.add(p);
      names.push([label, String(it.name || '').slice(0, 200)]);
      phones.push([p]);
    });
    if (phones.length) {
      const first = Math.max(last + 1, 2);
      sh.getRange(first, 1, names.length, 2).setValues(names);
      sh.getRange(first, cols.phone, phones.length, 1).setNumberFormat('@').setValues(phones);
    }
    const parts = [phones.length + ' added'];
    if (already) parts.push(already + ' already in the sheet');
    if (repeated) parts.push(repeated + ' repeated in the file');
    if (invalid) parts.push(invalid + ' not a valid Indian mobile');
    return { ok: true, added: phones.length, already: already, repeated: repeated, invalid: invalid,
      capped: body.rows.length > SMS_API_MAX_UPLOAD, message: parts.join(', ') + '.' };
  } finally {
    lock.releaseLock();
  }
}

/* ====== Automatic batches (26 Nov 2026) ======
 * Every 30 minutes the sheet's own Send Next 100 runs by itself (same function as the dashboard button), so new
 * numbers from the OCR are picked up on the next run and every rule still applies: never re-text a number, skip DND /
 * not-in-use numbers, only 9 AM - 9 PM IST, nothing in Dry run. Outside those hours or in Dry run a run sends nothing.
 * Menu (add to addSmsMenu_): .addItem('Automatic SMS ON (100 every 30 min)', 'smsAutoOn') .addItem('Automatic SMS OFF', 'smsAutoOff')
 * Last result: Script Property SMS_AUTO_LAST, and every send is in the SMS Logs tab as usual.
 */
const SMS_AUTO_HANDLER = 'smsAutoTick';
const SMS_AUTO_MINUTES = 30;

function smsAutoTick() {
  let line;
  try {
    const r = smsApiSendNext_();
    line = 'sent ' + r.sent + ', failed ' + r.failed + ', skipped ' + r.skipped;
  } catch (e) {
    line = 'nothing sent: ' + String(e && e.message || e).slice(0, 200);
  }
  line = Utilities.formatDate(new Date(), 'Asia/Kolkata', 'yyyy-MM-dd HH:mm') + '  ' + line;
  PropertiesService.getScriptProperties().setProperty('SMS_AUTO_LAST', line);
  Logger.log(line);
}

function smsAutoOn() {
  smsAutoOff_();
  ScriptApp.newTrigger(SMS_AUTO_HANDLER).timeBased().everyMinutes(SMS_AUTO_MINUTES).create();
  SpreadsheetApp.getUi().alert('Automatic SMS is ON: up to ' + SMS_API_LIMIT + ' every ' + SMS_AUTO_MINUTES +
    ' minutes, 9 AM - 9 PM.\nMode: ' + (isDryRun_() ? 'DRY RUN (nothing will be sent until you switch to Live)' : 'LIVE'));
}

function smsAutoOff() {
  smsAutoOff_();
  SpreadsheetApp.getUi().alert('Automatic SMS is OFF.');
}

function smsAutoOff_() {
  ScriptApp.getProjectTriggers().forEach(t => { if (t.getHandlerFunction() === SMS_AUTO_HANDLER) ScriptApp.deleteTrigger(t); });
}
