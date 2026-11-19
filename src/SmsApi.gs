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
