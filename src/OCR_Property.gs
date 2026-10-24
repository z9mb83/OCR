/****************************************************
 * IMAGE OCR — PROPERTY ADS  (Property NeoDove sheet → "Ads" tab)
 *
 * Fetches classified-ad images from a Drive folder into the sheet,
 * reads each one with OpenAI (gpt-4o-mini vision) and writes:
 *   A Image (thumbnail)  B Info  C Phone  D Location / Area
 * SMS columns (SMS Status / SMS Sent At) live further right and are
 * NEVER touched by this file — see docs/TROUBLESHOOTING.md #duplicate-sends.
 *
 * The OpenAI key is read from Script Properties (set via SMS → API keys…).
 ****************************************************/

/* ====== CONFIG ====== */
const OPENAI_API_KEY   = PropertiesService.getScriptProperties().getProperty('OPENAI_API_KEY') || '';
const OPENAI_MODEL     = "gpt-4o-mini";
const DRIVE_FOLDER_ID  = "YOUR_DRIVE_FOLDER_ID";   // folder with the ad images
const SPREADSHEET_ID   = "YOUR_SPREADSHEET_ID";
const TARGET_SHEET_GID = 0;                        // gid of the Ads tab (from the sheet URL)

/* ====== COLUMNS ====== */
const COL_IMAGE    = 1; // A
const COL_INFO     = 2; // B
const COL_PHONE    = 3; // C
const COL_LOCATION = 4; // D
const START_ROW    = 2;

/* ====== SETTINGS ====== */
const MAKE_IMAGES_PUBLIC_FOR_PREVIEW = true;  // =IMAGE() needs "anyone with link" on each file
const PROCESS_SUBFOLDERS = false;
const IMAGE_HEIGHT = 140;
const IMAGE_WIDTH  = 140;
const MAX_IMAGE_MB = 20;
const SLEEP_MS_BETWEEN_OPENAI_CALLS = 700;    // raise to ~2000 if you hit OpenAI 429 rate limits
const MAX_IMAGES_PER_RUN = 20;                // keeps each run under the 6-minute Apps Script limit

/* ====== MENU ====== */
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu("Image OCR")
    .addItem("Fetch Images", "fetchImages")
    .addItem("Process Images", "processImages")
    .addItem("Clean Existing Phone Numbers", "cleanExistingPhoneNumbers")
    .addToUi();
  addSmsMenu_(); // from Telinfy_SMS.gs
}

/* ====== 1. FETCH NEW IMAGES FROM DRIVE ====== */
function fetchImages() {
  const sheet = getExactWorksheet_();
  setupHeaders_(sheet);
  const files = listImageFiles_();
  const existing = getExistingFileIdRowMap_(sheet);
  let fetched = 0, skipped = 0;
  files.forEach(file => {
    if (existing[file.getId()]) { skipped++; return; }
    appendImageOnlyRow_(sheet, file);
    existing[file.getId()] = true;
    fetched++;
  });
  SpreadsheetApp.flush();
  SpreadsheetApp.getUi().alert(
    "Fetch Images finished.\n\nImages found in Drive: " + files.length +
    "\nNew images fetched: " + fetched + "\nAlready fetched skipped: " + skipped);
}

/* ====== 2. PROCESS FETCHED IMAGES WITH OPENAI ====== */
function processImages() {
  validateOpenAiKey_();
  const sheet = getExactWorksheet_();
  setupHeaders_(sheet);
  const lastRow = sheet.getLastRow();
  if (lastRow < START_ROW) {
    SpreadsheetApp.getUi().alert("No fetched images found.\n\nFirst run: Image OCR → Fetch Images");
    return;
  }
  let processed = 0, skipped = 0, errors = 0, missingFileId = 0, attempted = 0;

  for (let row = START_ROW; row <= lastRow; row++) {
    const fileId = getFileIdFromImageCell_(sheet, row);
    if (!fileId) { missingFileId++; continue; }

    const infoCell  = sheet.getRange(row, COL_INFO);
    const phoneCell = sheet.getRange(row, COL_PHONE);
    const existingInfo = String(infoCell.getDisplayValue() || "").trim();

    // Already processed → only tidy the phone number, never call OpenAI again
    if (existingInfo && !existingInfo.startsWith("ERROR:")) {
      const existingPhone = String(phoneCell.getDisplayValue() || "").trim();
      const cleaned = normalizePhoneNumber_(existingPhone);
      if (cleaned !== existingPhone) phoneCell.setNumberFormat("@").setValue(cleaned);
      skipped++;
      continue;
    }

    if (attempted >= MAX_IMAGES_PER_RUN) break;
    attempted++;

    try {
      const file = DriveApp.getFileById(fileId);
      const result = extractInfoFromImage_(file);
      infoCell.setValue(result.info || "");
      phoneCell.setNumberFormat("@").setValue(normalizePhoneNumber_(result.phone || ""));
      ensureRowMetadataCells_(sheet, row);
      sheet.getRange(row, COL_IMAGE).setNote(
        "FILE_ID: " + fileId + "\nFILE_NAME: " + file.getName() +
        "\nSTATUS: Processed\nPROCESSED_AT: " + new Date());
      processed++;
      SpreadsheetApp.flush();
      Utilities.sleep(SLEEP_MS_BETWEEN_OPENAI_CALLS);
    } catch (error) {
      errors++;
      infoCell.setValue("ERROR: " + error.message);   // rows starting with ERROR: are retried next run
      phoneCell.setNumberFormat("@").setValue("");
      const imageCell = sheet.getRange(row, COL_IMAGE);
      imageCell.setNote((imageCell.getNote() || "") +
        "\nSTATUS: Error\nERROR: " + error.message + "\nERROR_AT: " + new Date());
    }
  }

  SpreadsheetApp.getUi().alert(
    "Process Images finished.\n\nProcessed now: " + processed +
    "\nAlready processed skipped: " + skipped +
    "\nRows missing Drive File ID: " + missingFileId +
    "\nErrors: " + errors + "\n\n" +
    (attempted >= MAX_IMAGES_PER_RUN ? "Run Process Images again if more images remain."
                                      : "All available pending images were checked."));
}

/* ====== 3. CLEAN EXISTING PHONE NUMBERS ====== */
function cleanExistingPhoneNumbers() {
  const sheet = getExactWorksheet_();
  setupHeaders_(sheet);
  const lastRow = sheet.getLastRow();
  if (lastRow < START_ROW) { SpreadsheetApp.getUi().alert("No data rows found."); return; }
  let cleaned = 0, unchanged = 0, blank = 0, invalid = 0;
  for (let row = START_ROW; row <= lastRow; row++) {
    const cell = sheet.getRange(row, COL_PHONE);
    const existing = String(cell.getDisplayValue() || "").trim();
    if (!existing) { blank++; continue; }
    const c = normalizePhoneNumber_(existing);
    if (!c) { invalid++; continue; }
    if (c !== existing) { cell.setNumberFormat("@").setValue(c); cleaned++; } else { unchanged++; }
  }
  SpreadsheetApp.flush();
  SpreadsheetApp.getUi().alert("Phone cleanup finished.\n\nNumbers cleaned: " + cleaned +
    "\nAlready clean: " + unchanged + "\nBlank phone cells: " + blank + "\nInvalid phone cells: " + invalid);
}

/* ====== SHEET HELPERS ====== */
function validateOpenAiKey_() {
  if (!OPENAI_API_KEY || String(OPENAI_API_KEY).trim() === "") {
    throw new Error("OpenAI API key is missing. Add it via SMS → API keys…");
  }
}

function getExactWorksheet_() {
  const sheets = SpreadsheetApp.openById(SPREADSHEET_ID).getSheets();
  for (let i = 0; i < sheets.length; i++) {
    if (sheets[i].getSheetId() === Number(TARGET_SHEET_GID)) return sheets[i];
  }
  throw new Error("Could not find worksheet with GID: " + TARGET_SHEET_GID);
}

// Only A1:D1 are written, so SMS columns to the right are never overwritten.
function setupHeaders_(sheet) {
  sheet.getRange(1, 1, 1, 4).setValues([["Image", "Info", "Phone", "Location / Area"]]);
  sheet.setFrozenRows(1);
  sheet.setColumnWidth(COL_IMAGE, IMAGE_WIDTH + 30);
  sheet.setColumnWidth(COL_INFO, 520);
  sheet.setColumnWidth(COL_PHONE, 180);
  sheet.setColumnWidth(COL_LOCATION, 240);
  sheet.getRange(1, 1, 1, 4)
    .setFontWeight("bold").setBackground("#d9ead3")
    .setHorizontalAlignment("center").setVerticalAlignment("middle").setWrap(true);
  if (sheet.getMaxRows() >= START_ROW) {
    sheet.getRange(START_ROW, COL_PHONE, sheet.getMaxRows() - START_ROW + 1, 1).setNumberFormat("@");
  }
}

function appendImageOnlyRow_(sheet, file) {
  const fileId = file.getId();
  if (MAKE_IMAGES_PUBLIC_FOR_PREVIEW) {
    try { file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); }
    catch (e) { console.log("Could not change sharing for " + file.getName()); }
  }
  const row = Math.max(sheet.getLastRow() + 1, START_ROW);
  const imageUrl = "https://drive.google.com/thumbnail?id=" + fileId + "&sz=w600";
  sheet.getRange(row, COL_IMAGE).setFormula('=IMAGE("' + imageUrl + '",4,' + IMAGE_HEIGHT + "," + IMAGE_WIDTH + ")");
  sheet.getRange(row, COL_INFO).setValue("");
  sheet.getRange(row, COL_PHONE).setNumberFormat("@").setValue("");
  sheet.getRange(row, COL_LOCATION).setValue("Unclassified");
  sheet.getRange(row, COL_IMAGE).setNote(
    "FILE_ID: " + fileId + "\nFILE_NAME: " + file.getName() + "\nSTATUS: Fetched\nFETCHED_AT: " + new Date());
  sheet.setRowHeight(row, IMAGE_HEIGHT + 20);
}

function ensureRowMetadataCells_(sheet, row) {
  const cell = sheet.getRange(row, COL_LOCATION);
  if (!String(cell.getDisplayValue() || "").trim()) cell.setValue("Unclassified");
}

function getExistingFileIdRowMap_(sheet) {
  const map = {};
  for (let row = START_ROW; row <= sheet.getLastRow(); row++) {
    const id = getFileIdFromImageCell_(sheet, row);
    if (id) map[id] = row;
  }
  return map;
}

// File ID is kept in the image cell's note (and in the =IMAGE() URL as a fallback)
function getFileIdFromImageCell_(sheet, row) {
  const cell = sheet.getRange(row, COL_IMAGE);
  let m = (cell.getNote() || "").match(/FILE_ID:\s*([a-zA-Z0-9_-]+)/);
  if (m) return m[1];
  m = (cell.getFormula() || "").match(/id=([a-zA-Z0-9_-]+)/);
  return m ? m[1] : "";
}

/* ====== DRIVE HELPERS ====== */
function listImageFiles_() {
  const files = [];
  collectImageFiles_(DriveApp.getFolderById(DRIVE_FOLDER_ID), files);
  files.sort((a, b) => a.getName().localeCompare(b.getName()));
  return files;
}

function collectImageFiles_(folder, files) {
  const it = folder.getFiles();
  while (it.hasNext()) {
    const f = it.next();
    if ((f.getMimeType() || "").indexOf("image/") === 0) files.push(f);
  }
  if (PROCESS_SUBFOLDERS) {
    const fi = folder.getFolders();
    while (fi.hasNext()) collectImageFiles_(fi.next(), files);
  }
}

/* ====== OPENAI VISION OCR ====== */
function extractInfoFromImage_(file) {
  validateOpenAiKey_();
  const blob = file.getBlob();
  const bytes = blob.getBytes();
  const sizeMb = bytes.length / 1024 / 1024;
  if (sizeMb > MAX_IMAGE_MB) throw new Error("Image is too large: " + sizeMb.toFixed(2) + " MB");
  const mimeType = blob.getContentType() || file.getMimeType() || "image/jpeg";

  const prompt =
    "Read this real-estate classified advertisement image carefully.\n\n" +
    "Return valid JSON only in exactly this format:\n" +
    "{\n" +
    ' "info": "complete useful property advertisement text",\n' +
    ' "phone": "primary contact phone number"\n' +
    "}\n\n" +
    "Rules:\n" +
    "- Do not invent any information.\n" +
    "- Keep the original advertisement language.\n" +
    "- Correct obvious OCR spacing errors only.\n" +
    "- Include property type, sale or rent, location, sector, phase, project, size, floor, price, facing and furnishing when visible.\n" +
    "- Return only one primary contact phone number.\n" +
    "- If multiple numbers are visible, use the first clear contact number.\n" +
    "- If no phone number is visible, return an empty phone value.\n" +
    "- Do not repeat the phone number inside the info field when avoidable.\n" +
    "- Return JSON only.";

  const payload = {
    model: OPENAI_MODEL,
    messages: [{
      role: "user",
      content: [
        { type: "text", text: prompt },
        { type: "image_url", image_url: { url: "data:" + mimeType + ";base64," + Utilities.base64Encode(bytes), detail: "high" } }
      ]
    }],
    response_format: { type: "json_object" },
    max_tokens: 1400,
    temperature: 0
  };

  const response = UrlFetchApp.fetch("https://api.openai.com/v1/chat/completions", {
    method: "post",
    contentType: "application/json",
    headers: { Authorization: "Bearer " + OPENAI_API_KEY },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });
  const status = response.getResponseCode();
  const text = response.getContentText();
  if (status < 200 || status >= 300) throw new Error("OpenAI API error " + status + ": " + text.substring(0, 800));

  let json;
  try { json = JSON.parse(text); } catch (e) { throw new Error("OpenAI returned invalid JSON: " + text.substring(0, 500)); }
  if (!json.choices || !json.choices[0] || !json.choices[0].message) throw new Error("OpenAI response format was not recognized.");

  const content = String(json.choices[0].message.content || "").trim();
  let parsed;
  try { parsed = JSON.parse(content); } catch (e) { parsed = { info: content, phone: extractFirstPhoneNumber_(content) }; }
  const info = String(parsed.info || "").trim();
  let phone = String(parsed.phone || "").trim();
  if (!phone && info) phone = extractFirstPhoneNumber_(info);
  return { info, phone };
}

/* ====== PHONE HELPERS ====== */
function extractFirstPhoneNumber_(text) {
  const matches = String(text || "").match(/(?:\+?\d[\d\s().-]{7,}\d)/g) || [];
  for (let i = 0; i < matches.length; i++) {
    const n = normalizePhoneNumber_(matches[i]);
    if (n) return n;
  }
  return "";
}

// 919876051146 → 9876051146, 09876051146 → 9876051146. Keeps 11–15 digit international numbers.
// (The SMS script applies its own stricter Indian-mobile check before sending.)
function normalizePhoneNumber_(value) {
  if (!value) return "";
  const candidates = String(value).match(/(?:\+?\d[\d\s().-]{7,}\d)/g) || [String(value)];
  for (let i = 0; i < candidates.length; i++) {
    let d = candidates[i].replace(/\D/g, "");
    if (d.startsWith("00")) d = d.substring(2);
    if (d.length === 12 && d.startsWith("91")) d = d.substring(2);
    if (d.length === 11 && d.startsWith("0")) d = d.substring(1);
    if (d.length === 10) return d;
    if (d.length >= 11 && d.length <= 15) return d;
  }
  return "";
}
