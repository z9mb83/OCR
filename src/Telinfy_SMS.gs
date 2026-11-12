/******************************************************
 * TELINFY BULK SMS + SECURE API KEYS — Google Apps Script
 *
 * Sends DLT-approved SMS (India) through the Telinfy / GreenAds API
 * to the phone numbers in a Google Sheet, with:
 *   - private API-key storage (Script Properties, never in cells or code)
 *   - Dry run / Live switch (starts in Dry run)
 *   - templates managed in an "SMS Templates" tab (no code edits)
 *   - per-row SMS Status + SMS Sent At, duplicate / invalid skipping
 *   - "send next N" runner that never re-texts a number
 *   - full request/response log in an "SMS Logs" tab
 *
 * INSTALL (see docs/SETUP.md for the full walkthrough)
 *   1. Extensions → Apps Script → "+" → Script → name it Telinfy_SMS → paste this file.
 *   2. In your EXISTING onOpen() add one line at the end:   addSmsMenu_();
 *      (Apps Script keeps only one onOpen per project — never add a second.)
 *   3. Save → reload the sheet → SMS → API keys… → paste keys → Save.
 *   4. SMS → Templates (add / edit)… → add one row per DLT-approved template.
 ******************************************************/

/* ====== CONFIG ====== */
const TELINFY_BASE_URL = 'https://hub.telinfy.com/unified/developer/api/v1';
const SMS_BATCH_SIZE   = 50;    // numbers per API call
const SMS_MAX_PER_RUN  = 500;   // stays well inside Apps Script's 6-minute limit; run again for more

// Header names the script looks for in row 1 of the data tab
const HDR_PHONE  = 'Phone';
const HDR_STATUS = 'SMS Status';   // created automatically if missing
const HDR_TIME   = 'SMS Sent At';  // created automatically if missing

// Status written for a number Telinfy accepted
const SMS_OK_LABEL = 'Sent (queued)';

// Used by sendNext100() (run from the editor, no pop-ups)
const DATA_TAB_NAME         = 'Ads';  // tab with the Phone column (Shaadi sheet: 'Sheet1')
const DEFAULT_TEMPLATE_NAME = '';     // Name from the SMS Templates tab; '' = first active template

// DLT templates live in the "SMS Templates" tab. One row per template.
// Message text must match DLT EXACTLY. For variables put {#var#} in the text and
// list the column headers that fill them, in order, in "Variable Columns".
const SMS_TEMPLATES_TAB = 'SMS Templates';
const SMS_TEMPLATE_HEADERS = ['Name', 'Template ID', 'Sender ID', 'Route', 'Message Text (exact DLT)', 'Variable Columns', 'Active'];

// Optional hard-coded templates (normally leave empty and use the tab). Example:
// const SMS_TEMPLATES = {
//   OUTREACH: { label: 'Outreach', senderId: '099559', templateId: '1677100000000000000',
//               route: 'Promotional', text: 'Exact DLT text…', varHeaders: [] }
// };
const SMS_TEMPLATES = {};

/* ====== MENU (call addSmsMenu_() from your onOpen) ====== */
function addSmsMenu_() {
  SpreadsheetApp.getUi()
    .createMenu('SMS')
    .addItem('API keys…', 'showKeyDialog')
    .addItem('Templates (add / edit)…', 'openTemplatesTab')
    .addItem('Check templates with Telinfy', 'checkTemplatesWithTelinfy')
    .addSeparator()
    .addItem('Send test SMS (type numbers)', 'menuSendTest')
    .addItem('Bulk send: selected rows', 'menuSendSelected')
    .addItem('Bulk send: all unsent rows', 'menuSendAllUnsent')
    .addSeparator()
    .addItem('Mode: switch Live / Dry run', 'toggleDryRun')
    .addToUi();
}

/* ====== SECURE KEY STORAGE ====== */
function showKeyDialog() {
  const p = PropertiesService.getScriptProperties();
  const mask = k => { const v = p.getProperty(k); return v ? 'saved (…' + v.slice(-4) + ')' : 'not set'; };
  const html = HtmlService.createHtmlOutput(`
    <style>
      body{font-family:Arial,sans-serif;font-size:13px;padding:4px 8px}
      label{display:block;margin-top:12px;font-weight:bold}
      input{width:100%;padding:7px;margin-top:4px;box-sizing:border-box}
      small{color:#666} button{margin-top:16px;padding:8px 16px}
    </style>
    <label>OpenAI API key <small>${mask('OPENAI_API_KEY')}</small></label>
    <input id="openai" type="password" autocomplete="off" placeholder="leave blank to keep current">
    <label>Telinfy SMS API key <small>${mask('TELINFY_API_KEY')}</small></label>
    <input id="telinfy" type="password" autocomplete="off" placeholder="leave blank to keep current">
    <button onclick="save()">Save</button> <span id="msg"></span>
    <script>
      function save(){
        document.getElementById('msg').textContent='Saving…';
        google.script.run
          .withSuccessHandler(m=>{document.getElementById('msg').textContent=m;
            document.getElementById('openai').value='';document.getElementById('telinfy').value='';})
          .withFailureHandler(e=>document.getElementById('msg').textContent='Error: '+e.message)
          .saveApiKeys(document.getElementById('openai').value, document.getElementById('telinfy').value);
      }
    </script>`).setWidth(420).setHeight(270);
  SpreadsheetApp.getUi().showModalDialog(html, 'API keys (stored privately)');
}

function saveApiKeys(openaiKey, telinfyKey) {
  const p = PropertiesService.getScriptProperties();
  const saved = [];
  if (openaiKey && openaiKey.trim())   { p.setProperty('OPENAI_API_KEY',  openaiKey.trim());  saved.push('OpenAI'); }
  if (telinfyKey && telinfyKey.trim()) { p.setProperty('TELINFY_API_KEY', telinfyKey.trim()); saved.push('Telinfy'); }
  return saved.length ? 'Saved: ' + saved.join(', ') : 'Nothing changed.';
}

function isDryRun_() {
  return PropertiesService.getScriptProperties().getProperty('SMS_DRY_RUN') !== 'false'; // default = dry run
}

function toggleDryRun() {
  const p = PropertiesService.getScriptProperties();
  const goLive = isDryRun_();
  p.setProperty('SMS_DRY_RUN', goLive ? 'false' : 'true');
  SpreadsheetApp.getUi().alert(goLive ? 'LIVE mode: SMS will really be sent.' : 'DRY RUN mode: nothing will be sent, only logged.');
}

/* ====== MENU ACTIONS ====== */
function menuSendTest() {
  const ui = SpreadsheetApp.getUi();
  const tpl = pickTemplate_(); if (!tpl) return;
  const res = ui.prompt('Test SMS – ' + tpl.label, 'Mobile numbers, comma-separated:', ui.ButtonSet.OK_CANCEL);
  if (res.getSelectedButton() !== ui.Button.OK) return;
  const numbers = res.getResponseText().split(',').map(normalizeIndianMobile_).filter(Boolean);
  if (!numbers.length) return ui.alert('No valid 10-digit mobile numbers.');
  if (tpl.varHeaders.length) return ui.alert('This template has variables — use Bulk send on rows instead.');
  if (!withinPromoWindow_(tpl)) return ui.alert('Promotional SMS can only be sent 9 AM – 9 PM IST.');
  const r = sendTemplateSms_(tpl, numbers, [], 'Test_' + stamp_());
  ui.alert((r.ok ? 'Accepted: ' : 'Failed: ') + r.message + (isDryRun_() ? '  (DRY RUN)' : ''));
}

function menuSendSelected() {
  const sel = SpreadsheetApp.getActiveRange();
  const rows = [];
  for (let r = sel.getRow(); r < sel.getRow() + sel.getNumRows(); r++) if (r > 1) rows.push(r);
  bulkSend_(rows);
}

function menuSendAllUnsent() {
  const sh = SpreadsheetApp.getActiveSheet();
  const cols = getCols_(sh);
  const last = sh.getLastRow();
  if (last < 2) return;
  const status = sh.getRange(2, cols.status, last - 1, 1).getValues();
  const rows = [];
  status.forEach((s, i) => { if (!isFinalSmsStatus_(s[0])) rows.push(i + 2); });
  bulkSend_(rows);
}

/* ====== BULK SEND (menu) ====== */
function bulkSend_(rows) {
  const ui = SpreadsheetApp.getUi();
  const sh = SpreadsheetApp.getActiveSheet();      // capture BEFORE anything can change the active tab
  const tpl = pickTemplate_(); if (!tpl) return;
  if (!withinPromoWindow_(tpl)) return ui.alert('Promotional SMS can only be sent 9 AM – 9 PM IST.');
  if (!isDryRun_() && !PropertiesService.getScriptProperties().getProperty('TELINFY_API_KEY'))
    return ui.alert('Add your Telinfy key first: SMS → API keys…');

  const cols = getCols_(sh);
  const lastCol = sh.getLastColumn();
  const headers = sh.getRange(1, 1, 1, lastCol).getValues()[0].map(h => String(h).trim());
  const varIdx = tpl.varHeaders.map(h => {
    const i = headers.indexOf(h);
    if (i < 0) throw new Error('Column "' + h + '" not found for template variables.');
    return i;
  });

  const data = sh.getRange(1, 1, sh.getLastRow(), lastCol).getValues();
  const alreadySent = alreadySentNumbers_(data, cols);
  const hist = telinfyHistory_([tpl.text]);   // DND / not in use / already texted, from Telinfy
  hist.sent.forEach(p => alreadySent.add(p));

  const queue = [], skipped = [], seen = new Set();
  rows.forEach(rowNum => {
    const r = data[rowNum - 1]; if (!r) return;
    if (isFinalSmsStatus_(r[cols.status - 1])) return;
    const phones = extractIndianMobiles_(r[cols.phone - 1]);
    let reason = '';
    if (!phones.length) reason = 'Skipped: invalid number';
    const vars = varIdx.map(i => String(r[i] || '').trim());
    if (!reason && vars.some(v => !v)) reason = 'Skipped: missing variable';
    const fresh = phones.filter(p => !seen.has(p) && !alreadySent.has(p) && !hist.blocked[p]);
    if (!reason && !fresh.length) reason = smsSkipReason_(phones, hist);
    if (reason) { skipped.push({ row: rowNum, reason }); return; }
    fresh.forEach(p => { seen.add(p); queue.push({ row: rowNum, phone: p, vars }); });
  });

  const toSend = queue.slice(0, SMS_MAX_PER_RUN);
  const msg = 'Template: ' + tpl.label + '\nSend to: ' + toSend.length + ' numbers' +
              (queue.length > toSend.length ? ' (run again for the remaining ' + (queue.length - toSend.length) + ')' : '') +
              '\nSkipped: ' + skipped.length + '\nMode: ' + (isDryRun_() ? 'DRY RUN (nothing sent)' : 'LIVE') + '\n\nContinue?';
  if (ui.alert('Bulk SMS', msg, ui.ButtonSet.YES_NO) !== ui.Button.YES) return;

  const res = sendQueue_(sh, cols, tpl, toSend, skipped, 'Sheet_' + stamp_());
  ui.alert('Done. Accepted: ' + res.ok + '   Failed: ' + res.bad + '   Skipped: ' + skipped.length +
           (isDryRun_() ? '\n(DRY RUN — check the "SMS Logs" tab)' : '\nDelivery results: Telinfy → Reports'));
}

/* ====== SEND NEXT N (run from the Apps Script editor, no pop-ups) ======
 * Picks the next rows with an EMPTY SMS Status, top to bottom, skips every number
 * already texted (status column + SMS Logs history) and sends up to `limit` numbers.
 * Editor: select sendNext100 → Run. Result appears in the Execution log.
 */
function sendNext100() {
  const sh = SpreadsheetApp.getActive().getSheetByName(DATA_TAB_NAME);
  const list = loadTemplates_();
  const tpl = (DEFAULT_TEMPLATE_NAME && list.find(t => t.label === DEFAULT_TEMPLATE_NAME)) || list[0];
  sendNextBatch_(sh, tpl, 100);
}

function sendNextBatch_(sh, tpl, limit) {
  if (!sh) throw new Error('Data tab "' + DATA_TAB_NAME + '" not found.');
  if (!tpl) throw new Error('No template found — add one in the SMS Templates tab.');
  if (isDryRun_()) throw new Error('Mode is DRY RUN. Switch to Live first: SMS → Mode: switch Live / Dry run.');
  if (!PropertiesService.getScriptProperties().getProperty('TELINFY_API_KEY')) throw new Error('Telinfy key missing: SMS → API keys…');
  if (!withinPromoWindow_(tpl)) throw new Error('Promotional SMS can only be sent 9 AM – 9 PM IST.');
  if (tpl.varHeaders && tpl.varHeaders.length) throw new Error('This template has variables – use the SMS menu instead.');

  const cols = getCols_(sh);
  const data = sh.getRange(1, 1, sh.getLastRow(), sh.getLastColumn()).getValues();
  const alreadySent = alreadySentNumbers_(data, cols);
  const hist = telinfyHistory_([tpl.text]);   // DND / not in use / already texted, from Telinfy
  hist.sent.forEach(p => alreadySent.add(p));

  const queue = [], skipped = [], seen = new Set();
  for (let i = 1; i < data.length && queue.length < limit; i++) {
    const r = data[i];
    if (String(r[cols.status - 1] || '').trim() !== '') continue;   // only rows never touched
    const phones = extractIndianMobiles_(r[cols.phone - 1]);
    if (!phones.length) { skipped.push({ row: i + 1, reason: 'Skipped: invalid number' }); continue; }
    const fresh = phones.filter(p => !seen.has(p) && !alreadySent.has(p) && !hist.blocked[p]);
    if (!fresh.length) { skipped.push({ row: i + 1, reason: smsSkipReason_(phones, hist) }); continue; }
    if (queue.length + fresh.length > limit) break;
    fresh.forEach(p => { seen.add(p); queue.push({ row: i + 1, phone: p, vars: [] }); });
  }

  const campaign = 'Next' + limit + '_' + stamp_();
  const res = sendQueue_(sh, cols, tpl, queue, skipped, campaign);
  const rowsUsed = queue.map(q => q.row);
  Logger.log('Template: ' + tpl.label + ' | Campaign: ' + campaign + ' | Accepted: ' + res.ok + ' | Failed: ' + res.bad +
    ' | Skipped (marked): ' + skipped.length + ' | Rows ' +
    (rowsUsed.length ? Math.min(...rowsUsed) + '–' + Math.max(...rowsUsed) : 'none'));
}

/* ====== SHARED SEND LOOP ====== */
function sendQueue_(sh, cols, tpl, queue, skipped, campaign) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) throw new Error('Another send is already running.');
  let ok = 0, bad = 0;
  try {
    skipped.forEach(s => sh.getRange(s.row, cols.status).setValue(s.reason));
    // No variables → one API call per batch of 50. With variables → one call per number (text differs).
    const groups = tpl.varHeaders.length ? queue.map(q => [q]) : chunk_(queue, SMS_BATCH_SIZE);
    groups.forEach(g => {
      const r = sendTemplateSms_(tpl, g.map(q => q.phone), g[0].vars, campaign);
      const now = new Date();
      g.forEach(q => {
        const pn = r.perNumber && r.perNumber[q.phone];        // per-number result when Telinfy gives one
        const qOk = r.hasPerNumber ? (pn ? pn.ok : false) : r.ok;
        const qMsg = pn ? pn.message : (r.hasPerNumber ? 'No per-number response from Telinfy' : r.message);
        sh.getRange(q.row, cols.status).setValue(qOk ? (isDryRun_() ? 'Dry run OK' : SMS_OK_LABEL) : 'Failed: ' + qMsg);
        sh.getRange(q.row, cols.time).setValue(now);
        qOk ? ok++ : bad++;
      });
      Utilities.sleep(tpl.varHeaders.length ? 200 : 1000);
    });
    SpreadsheetApp.flush();
  } finally {
    lock.releaseLock();
  }
  return { ok, bad };
}

/* ====== TELINFY API CALL ====== */
function sendTemplateSms_(tpl, numbers, vars, campaignName) {
  const message = fillTemplate_(tpl.text, vars || []);
  const payload = {
    Sender_Name:   tpl.senderId,
    SMS_Message:   message,
    mobile_Number: numbers.length === 1 ? numbers[0] : numbers,
    template_id:   tpl.templateId,
    campaign_name: campaignName
  };

  if (isDryRun_()) {
    logSms_(campaignName, numbers, 'DRY_RUN', '', JSON.stringify(payload));
    return { ok: true, message: 'dry run' };
  }

  const apiKey = PropertiesService.getScriptProperties().getProperty('TELINFY_API_KEY');
  try {
    const resp = UrlFetchApp.fetch(TELINFY_BASE_URL + '/sms/send', {
      method: 'post',
      contentType: 'application/json',
      headers: { 'x-api-key': apiKey },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    });
    const code = resp.getResponseCode();
    const body = resp.getContentText();
    let json = {}; try { json = JSON.parse(body); } catch (e) {}
    const isSuccess = s => String(s || '').toLowerCase() === 'success';
    // Telinfy replies in one of three shapes (see docs/API_REFERENCE.md):
    //   single : { responses:[{status,message,mobile_Number,timestamp}] }
    //   bulk   : { status:"Success", message:"Bulk SMS send successfully", total_numbers, bulkResult:"Inserted Successfully" }
    //   error  : { status:"...", message:"..." }
    const items = Array.isArray(json.responses) ? json.responses
                : Array.isArray(json.bulkResult) ? json.bulkResult : null;
    const perNumber = {};
    if (items) items.forEach(it => {
      const n = normalizeIndianMobile_(it.mobile_Number || it.mobile || it.number || '');
      if (n) perNumber[n] = { ok: isSuccess(it.status), message: it.message || it.status || '' };
    });
    const httpOk = code >= 200 && code < 300;
    const ok = httpOk && (items ? items.some(it => isSuccess(it.status)) : isSuccess(json.status));
    logSms_(campaignName, numbers, ok ? 'OK' : 'ERROR', code, body);
    const firstMsg = items && items[0] ? items[0].message : json.message;
    return { ok, message: firstMsg || ('HTTP ' + code), perNumber: httpOk ? perNumber : {}, hasPerNumber: !!items };
  } catch (err) {
    logSms_(campaignName, numbers, 'EXCEPTION', '', String(err));
    return { ok: false, message: String(err).slice(0, 100) };
  }
}

/* ====== TEMPLATES TAB ====== */
function getTemplatesSheet_() {
  const ss = SpreadsheetApp.getActive();
  let sh = ss.getSheetByName(SMS_TEMPLATES_TAB);
  if (!sh) {
    const wasActive = ss.getActiveSheet();
    sh = ss.insertSheet(SMS_TEMPLATES_TAB, ss.getSheets().length);
    ss.setActiveSheet(wasActive); // inserting a tab makes it active; keep the user on their data tab
    sh.getRange(1, 1, 1, SMS_TEMPLATE_HEADERS.length).setValues([SMS_TEMPLATE_HEADERS])
      .setFontWeight('bold').setBackground('#d9ead3').setWrap(true);
    sh.setFrozenRows(1);
    sh.setColumnWidth(1, 180); sh.setColumnWidth(2, 190); sh.setColumnWidth(3, 90);
    sh.setColumnWidth(4, 110); sh.setColumnWidth(5, 520); sh.setColumnWidth(6, 220); sh.setColumnWidth(7, 70);
    sh.getRange('B:C').setNumberFormat('@'); // 19-digit IDs lose digits if stored as numbers
    sh.getRange('D2:D').setDataValidation(SpreadsheetApp.newDataValidation()
      .requireValueInList(['Promotional', 'Transactional', 'Service Implicit', 'Service Explicit'], true).build());
    sh.getRange('G2:G').setDataValidation(SpreadsheetApp.newDataValidation()
      .requireValueInList(['Yes', 'No'], true).build());
    sh.getRange('E1').setNote('Paste the template text EXACTLY as approved on DLT. Use {#var#} for variables.');
    sh.getRange('F1').setNote('Only for templates with {#var#}. Column headers from the data tab, in the same order as the placeholders, comma-separated.');
  }
  return sh;
}

function openTemplatesTab() {
  const sh = getTemplatesSheet_();
  SpreadsheetApp.getActive().setActiveSheet(sh);
  SpreadsheetApp.getUi().alert(
    'Add one row per DLT-approved template:\n\n' +
    '• Name – any label\n• Template ID – 19-digit DLT ID\n• Sender ID – e.g. 099559\n' +
    '• Route – Promotional / Transactional / Service\n• Message Text – exactly as approved on DLT\n' +
    '• Variable Columns – only if the text has {#var#}\n• Active – Yes\n\n' +
    'The template must also be added in Telinfy → Templates with the same ID and text.');
}

function loadTemplates_() {
  const list = Object.keys(SMS_TEMPLATES).map(k => SMS_TEMPLATES[k]);
  const sh = getTemplatesSheet_();
  if (sh.getLastRow() < 2) return list;
  const rows = sh.getRange(2, 1, sh.getLastRow() - 1, SMS_TEMPLATE_HEADERS.length).getDisplayValues();
  rows.forEach(r => {
    const [name, id, sender, route, text, vars, active] = r.map(x => String(x).trim());
    if (!id || !sender || !text) return;
    if (active && active.toLowerCase() === 'no') return;
    const varHeaders = vars ? vars.split(',').map(s => s.trim()).filter(Boolean) : [];
    const placeholders = (text.match(/\{#var#\}/gi) || []).length;
    if (placeholders !== varHeaders.length) return; // mismatched setup — skipped
    list.push({ label: name || id, templateId: id, senderId: sender, route: route || 'Promotional', text, varHeaders });
  });
  return list;
}

function pickTemplate_() {
  const ui = SpreadsheetApp.getUi();
  const list = loadTemplates_();
  if (!list.length) {
    ui.alert('No templates yet.\n\nGo to SMS → Templates (add / edit)… and add your DLT-approved template.\n' +
             '(Rows need Template ID, Sender ID and Message Text, and the number of {#var#} must match Variable Columns.)');
    return null;
  }
  if (list.length === 1) return list[0];
  const menu = list.map((t, i) => (i + 1) + '. ' + t.label).join('\n');
  const res = ui.prompt('Choose template', menu + '\n\nType the number:', ui.ButtonSet.OK_CANCEL);
  if (res.getSelectedButton() !== ui.Button.OK) return null;
  const t = list[Number(res.getResponseText()) - 1];
  if (!t) ui.alert('Invalid choice.');
  return t || null;
}

/* ====== HELPERS ====== */
function getCols_(sh) {
  const lastCol = Math.max(sh.getLastColumn(), 1);
  const headers = sh.getRange(1, 1, 1, lastCol).getValues()[0].map(h => String(h).trim());
  const find = name => headers.indexOf(name) + 1;
  const phone = find(HDR_PHONE);
  if (!phone) throw new Error('No "' + HDR_PHONE + '" column in row 1 of this tab.');
  let status = find(HDR_STATUS), time = find(HDR_TIME);
  if (!status) { status = sh.getLastColumn() + 1; sh.getRange(1, status).setValue(HDR_STATUS).setFontWeight('bold'); }
  if (!time)   { time   = sh.getLastColumn() + 1; sh.getRange(1, time).setValue(HDR_TIME).setFontWeight('bold'); }
  return { phone, status, time };
}

// Every number already texted: status column AND the SMS Logs history.
// The log check protects against re-sending if a header is ever renamed or a status column is lost.
function alreadySentNumbers_(data, cols) {
  const set = new Set();
  data.slice(1).forEach(r => {
    if (/^(Sent|Accepted)/.test(String(r[cols.status - 1] || ''))) extractIndianMobiles_(r[cols.phone - 1]).forEach(p => set.add(p));
  });
  const logSh = SpreadsheetApp.getActive().getSheetByName('SMS Logs');
  if (logSh && logSh.getLastRow() > 1) {
    logSh.getRange(2, 1, logSh.getLastRow() - 1, 4).getValues().forEach(r => {
      if (String(r[3]) === 'OK') String(r[2]).split(',').forEach(n => { const p = normalizeIndianMobile_(n); if (p) set.add(p); });
    });
  }
  return set;
}

function isFinalSmsStatus_(value) {
  const s = String(value || '');
  return s.startsWith('Sent') || s.startsWith('Accepted') || s.startsWith('Skipped');
}

function fillTemplate_(text, vars) {
  let i = 0;
  return text.replace(/\{#var#\}/gi, () => {
    const v = vars[i++];
    if (v === undefined) throw new Error('Missing value for variable #' + i);
    return String(v).slice(0, 30); // DLT default: max 30 chars per variable
  });
}

// One cell can hold several numbers ("98xxxxxxxx, 97xxxxxxxx") — returns all valid mobiles.
function extractIndianMobiles_(v) {
  const text = String(v || '');
  const matches = text.match(/(?:\+?91[\s().-]*)?[6-9]\d[\d\s().-]{7,}\d/g) || [];
  const out = [];
  matches.forEach(m => { const p = normalizeIndianMobile_(m); if (p && out.indexOf(p) === -1) out.push(p); });
  if (!out.length) { const p = normalizeIndianMobile_(text); if (p) out.push(p); }
  return out;
}

// Strict: +91 / 0 prefixes are removed, anything that isn't a 10-digit 6-9 mobile
// (1800 toll-free, landlines, foreign numbers) returns ''.
function normalizeIndianMobile_(v) {
  let d = String(v || '').replace(/\D/g, '');
  if (d.length === 12 && d.startsWith('91')) d = d.slice(2);
  if (d.length === 11 && d.startsWith('0'))  d = d.slice(1);
  return /^[6-9]\d{9}$/.test(d) ? d : '';
}

function withinPromoWindow_(tpl) {
  if (String(tpl.route).toLowerCase() !== 'promotional') return true;
  const h = Number(Utilities.formatDate(new Date(), 'Asia/Kolkata', 'H'));
  return h >= 9 && h < 21;
}

function chunk_(arr, n) {
  const out = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

function getLogSheet_() {
  const ss = SpreadsheetApp.getActive();
  let sh = ss.getSheetByName('SMS Logs');
  if (!sh) {
    const wasActive = ss.getActiveSheet();
    sh = ss.insertSheet('SMS Logs');
    ss.setActiveSheet(wasActive);
    sh.appendRow(['Time', 'Campaign', 'Numbers', 'Result', 'HTTP Code', 'Response']);
    sh.getRange(1, 1, 1, 6).setFontWeight('bold');
  }
  return sh;
}

function logSms_(campaign, numbers, result, code, body) {
  // ' keeps the list as text: otherwise Sheets turns "98…,97…" into one big number and the digits are lost
  getLogSheet_().appendRow([new Date(), campaign, "'" + numbers.join(','), result, code, String(body).slice(0, 2000)]);
}

function stamp_() {
  return Utilities.formatDate(new Date(), 'Asia/Kolkata', 'yyyyMMdd_HHmm');
}

/* ====== TELINFY HISTORY (added 2026-10-29) ======
 * Before sending, read Telinfy's delivery reports (read-only, one API call) and:
 *  - skip numbers the operators reported as DND (error 650) or not in use / barred (errors 3, 2),
 *    unless that number was delivered at some point;
 *  - treat numbers Telinfy already texted with this sheet's template(s) as already sent
 *    (covers SMS Logs rows whose number lists were mangled into one big number).
 * If Telinfy can't be reached, sending continues with the old checks (status column + SMS Logs).
 */
const SMS_HISTORY_DAYS = 90;

function telinfyHistory_(texts) {
  const out = { ok: false, rows: 0, sent: new Set(), blocked: {} };
  const key = PropertiesService.getScriptProperties().getProperty('TELINFY_API_KEY');
  if (!key) return out;
  const day = d => Utilities.formatDate(d, 'Asia/Kolkata', 'yyyy-MM-dd');
  const from = day(new Date(Date.now() - SMS_HISTORY_DAYS * 86400000)), to = day(new Date());
  try {
    const resp = UrlFetchApp.fetch(TELINFY_BASE_URL + '/sms/reports?startDate=' + from + '&endDate=' + to,
      { headers: { 'x-api-key': key }, muteHttpExceptions: true });
    const json = JSON.parse(resp.getContentText());
    if (resp.getResponseCode() !== 200 || !Array.isArray(json.data)) {
      Logger.log('Telinfy history not available (HTTP ' + resp.getResponseCode() + '): ' + String(json.message || '').slice(0, 100));
      return out;
    }
    const heads = texts.map(t => String(t || '').slice(0, 40)).filter(Boolean);
    const delivered = new Set();
    json.data.forEach(x => {
      const p = normalizeIndianMobile_(x.mobile_number); if (!p) return;
      const code = Number(x.error_code);
      if (Number(x.status) === 1) delivered.add(p);
      else if (code === 650) out.blocked[p] = 'Skipped: DND';
      else if ((code === 3 || code === 2) && !out.blocked[p]) out.blocked[p] = 'Skipped: number not in use';
      if (heads.indexOf(String(x.message || '').slice(0, 40)) >= 0) out.sent.add(p);
    });
    delivered.forEach(p => delete out.blocked[p]);
    out.ok = true; out.rows = json.data.length;
  } catch (e) {
    Logger.log('Telinfy history not available: ' + String(e).slice(0, 150));
  }
  return out;
}

// Texts of this sheet's templates (Property: SMS Templates tab; Shaadi: SMS_TEMPLATES in this file).
function smsTemplateTexts_() {
  const list = typeof loadTemplates_ === 'function' ? loadTemplates_() : Object.keys(SMS_TEMPLATES).map(k => SMS_TEMPLATES[k]);
  return list.map(t => t.text);
}

// Status for a row with nothing left to send: the DND / not-in-use reason if one applies, else duplicate.
function smsSkipReason_(phones, hist) {
  const b = phones.map(p => hist.blocked[p]).filter(Boolean);
  return b.length ? b[0] : 'Skipped: duplicate';
}

/** Read-only check, run from the editor: what the Telinfy history would skip. Sends nothing and changes nothing. */
function smsCheckHistory() {
  const hist = telinfyHistory_(smsTemplateTexts_());
  Logger.log('Telinfy history: ' + (hist.ok ? hist.rows + ' SMS in the last ' + SMS_HISTORY_DAYS + ' days' : 'NOT AVAILABLE') +
    ' | DND / not-in-use numbers: ' + Object.keys(hist.blocked).length + ' | texted with this sheet\'s template: ' + hist.sent.size);
  const sh = getExactWorksheet_();
  const head = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(h => String(h).trim());
  const cPhone = head.indexOf(HDR_PHONE), cStatus = head.indexOf(HDR_STATUS);
  if (cPhone < 0 || cStatus < 0) return Logger.log('Phone / SMS Status column not found.');
  const phonesOf = v => (typeof extractIndianMobiles_ === 'function') ? extractIndianMobiles_(v) : [normalizeIndianMobile_(v)].filter(Boolean);
  let unsent = 0, dnd = 0, dead = 0, dup = 0;
  sh.getRange(2, 1, Math.max(sh.getLastRow() - 1, 1), sh.getLastColumn()).getValues().forEach(r => {
    if (String(r[cStatus] || '').trim() !== '') return;
    const phones = phonesOf(r[cPhone]); if (!phones.length) return;
    unsent++;
    if (!phones.every(p => hist.blocked[p] || hist.sent.has(p))) return;
    const why = smsSkipReason_(phones, hist);
    why === 'Skipped: DND' ? dnd++ : why === 'Skipped: duplicate' ? dup++ : dead++;
  });
  Logger.log('Rows not texted yet: ' + unsent + ' | next send would skip: ' + dnd + ' DND, ' + dead + ' not in use, ' + dup + ' already texted');
}


/* ====== CHECK TEMPLATES WITH TELINFY (read-only, sends nothing) ====== */
function telinfyTemplateList_() {
  const key = PropertiesService.getScriptProperties().getProperty('TELINFY_API_KEY');
  if (!key) throw new Error('Telinfy key missing: SMS → API keys…');
  const resp = UrlFetchApp.fetch(TELINFY_BASE_URL + '/sms/templates', { headers: { 'x-api-key': key }, muteHttpExceptions: true });
  if (resp.getResponseCode() !== 200) throw new Error('Telinfy answered HTTP ' + resp.getResponseCode());
  const found = [];
  // the response shape is not documented: collect every object that has a 19-digit ID and a long text
  const walk = v => {
    if (Array.isArray(v)) return v.forEach(walk);
    if (!v || typeof v !== 'object') return;
    const vals = Object.keys(v).map(k => v[k]);
    const id = vals.map(x => String(x == null ? '' : x)).find(x => /^\d{19}$/.test(x));
    const text = vals.filter(x => typeof x === 'string' && x.length > 30 && !/^\d+$/.test(x)).sort((a, b) => b.length - a.length)[0];
    if (id && text) found.push({ id: id, text: text });
    vals.forEach(x => { if (x && typeof x === 'object') walk(x); });
  };
  walk(JSON.parse(resp.getContentText()));
  return found;
}

function smsTemplateReport_() {
  const sh = getTemplatesSheet_(), telinfy = telinfyTemplateList_(), lines = [];
  const rows = sh.getLastRow() >= 2 ? sh.getRange(2, 1, sh.getLastRow() - 1, SMS_TEMPLATE_HEADERS.length).getDisplayValues() : [];
  rows.forEach(r => {
    const name = String(r[0]).trim(), id = String(r[1]).trim(), text = String(r[4]).trim(), active = String(r[6]).trim();
    if (!id && !text) return;
    const label = (name || id) + (active.toLowerCase() === 'no' ? ' (not active)' : '');
    const t = telinfy.find(x => x.id === id);
    if (!t) { lines.push('✗ ' + label + ': template ID ' + id + ' is not in Telinfy → add it in Telinfy → Templates.'); return; }
    if (t.text.trim() === text) { lines.push('✓ ' + label + ': ID and text match Telinfy exactly.'); return; }
    let i = 0; while (i < text.length && text[i] === t.text.trim()[i]) i++;
    lines.push('✗ ' + label + ': text differs from Telinfy at character ' + (i + 1) + ' ("…' + text.slice(Math.max(0, i - 15), i + 15) +
      '…" vs "…' + t.text.trim().slice(Math.max(0, i - 15), i + 15) + '…"). SMS with a different text are rejected.');
  });
  return (lines.length ? lines.join('\n') : 'No templates in the SMS Templates tab.') + '\n\n(' + telinfy.length + ' templates found in Telinfy)';
}

function checkTemplatesWithTelinfy() {
  const ui = SpreadsheetApp.getUi();
  try { ui.alert('Templates vs Telinfy', smsTemplateReport_(), ui.ButtonSet.OK); }
  catch (e) { ui.alert('Could not check: ' + e.message); }
}

/** Run from the editor: lists the templates the script will use and the Telinfy check. Sends nothing. */
function smsTemplatesSelfTest() {
  loadTemplates_().forEach((t, i) => Logger.log((i + 1) + '. ' + t.label + ' | ' + t.templateId + ' | ' + t.senderId + ' | ' + t.route + ' | ' + t.text.length + ' chars'));
  try { Logger.log(smsTemplateReport_()); } catch (e) { Logger.log('Telinfy check: ' + e.message); }
}
