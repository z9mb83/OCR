/****************************************************
 * IMAGE OCR — MATRIMONIAL ADS  (Shaadi NeoDove sheet → "Sheet1")
 *
 * Same pipeline as OCR_Property.gs but simpler: A Image | B Info | C Phone.
 * Phone can hold several numbers ("98…, 97…"); the SMS script texts each one.
 * The OpenAI key is read from Script Properties (set via SMS → API keys…).
 ****************************************************/

/* ====== CONFIG ====== */
const OPENAI_API_KEY   = PropertiesService.getScriptProperties().getProperty('OPENAI_API_KEY') || '';
const OPENAI_MODEL     = "gpt-4o-mini";
const DRIVE_FOLDER_ID  = "YOUR_DRIVE_FOLDER_ID";
const SPREADSHEET_ID   = "YOUR_SPREADSHEET_ID";
const TARGET_SHEET_GID = 0;

const COL_IMAGE = 1, COL_INFO = 2, COL_PHONE = 3;
const START_ROW = 2;

const MAKE_IMAGES_PUBLIC_FOR_PREVIEW = true;
const PROCESS_SUBFOLDERS = false;
const IMAGE_HEIGHT = 140, IMAGE_WIDTH = 140;
const MAX_IMAGE_MB = 20;
const SLEEP_MS_BETWEEN_OPENAI_CALLS = 700;

/* ====== MENU ====== */
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu("Image OCR")
    .addItem("Fetch Images", "fetchImages")
    .addItem("Process Images", "processImages")
    .addToUi();
  addSmsMenu_(); // from Telinfy_SMS.gs
}

/* ====== 1. FETCH ====== */
function fetchImages() {
  const sheet = getExactWorksheet_();
  setupHeaders_(sheet);
  const files = listImageFiles_();
  const existing = getExistingFileIdRowMap_(sheet);
  let fetched = 0, skipped = 0;
  files.forEach(file => {
    if (existing[file.getId()]) { skipped++; return; }
    appendImageOnlyRow_(sheet, file);
    fetched++;
  });
  SpreadsheetApp.flush();
  SpreadsheetApp.getUi().alert("Fetch Images finished.\n\nImages found in Drive: " + files.length +
    "\nNew images fetched: " + fetched + "\nAlready fetched skipped: " + skipped);
}

/* ====== 2. PROCESS ====== */
function processImages() {
  if (!OPENAI_API_KEY || OPENAI_API_KEY.trim() === "") throw new Error("OpenAI API key missing. Add it via SMS → API keys…");
  const sheet = getExactWorksheet_();
  setupHeaders_(sheet);
  const lastRow = sheet.getLastRow();
  if (lastRow < START_ROW) { SpreadsheetApp.getUi().alert("No fetched images found. First run: Image OCR > Fetch Images"); return; }

  let processed = 0, skipped = 0, errors = 0, missingFileId = 0;
  for (let row = START_ROW; row <= lastRow; row++) {
    const fileId = getFileIdFromImageCell_(sheet, row);
    if (!fileId) { missingFileId++; continue; }
    const existingInfo = String(sheet.getRange(row, COL_INFO).getValue() || "").trim();
    if (existingInfo && !existingInfo.startsWith("ERROR:")) { skipped++; continue; }
    try {
      const file = DriveApp.getFileById(fileId);
      const result = extractInfoFromImage_(file);
      sheet.getRange(row, COL_INFO).setValue(result.info || "");
      sheet.getRange(row, COL_PHONE).setValue(result.phone || "");
      sheet.getRange(row, COL_IMAGE).setNote("FILE_ID: " + fileId + "\nFILE_NAME: " + file.getName() +
        "\nSTATUS: Processed\nPROCESSED_AT: " + new Date());
      processed++;
      SpreadsheetApp.flush();
      Utilities.sleep(SLEEP_MS_BETWEEN_OPENAI_CALLS);
    } catch (err) {
      errors++;
      sheet.getRange(row, COL_INFO).setValue("ERROR: " + err.message);
      sheet.getRange(row, COL_PHONE).setValue("");
      const old = sheet.getRange(row, COL_IMAGE).getNote() || "";
      sheet.getRange(row, COL_IMAGE).setNote(old + "\nSTATUS: Error\nERROR: " + err.message + "\nERROR_AT: " + new Date());
    }
  }
  SpreadsheetApp.getUi().alert("Process Images finished.\n\nProcessed now: " + processed +
    "\nAlready processed skipped: " + skipped + "\nRows missing Drive File ID: " + missingFileId + "\nErrors: " + errors);
}

/* ====== SHEET HELPERS ====== */
function getExactWorksheet_() {
  const sheets = SpreadsheetApp.openById(SPREADSHEET_ID).getSheets();
  for (let i = 0; i < sheets.length; i++) if (sheets[i].getSheetId() === Number(TARGET_SHEET_GID)) return sheets[i];
  throw new Error("Could not find worksheet with GID: " + TARGET_SHEET_GID);
}

// Writes only A1:C1 — SMS columns further right are never touched.
function setupHeaders_(sheet) {
  sheet.getRange(1, COL_IMAGE).setValue("Image");
  sheet.getRange(1, COL_INFO).setValue("Info");
  sheet.getRange(1, COL_PHONE).setValue("Phone");
  sheet.setFrozenRows(1);
  sheet.setColumnWidth(COL_IMAGE, IMAGE_WIDTH + 30);
  sheet.setColumnWidth(COL_INFO, 520);
  sheet.setColumnWidth(COL_PHONE, 180);
  sheet.getRange(1, 1, 1, 3).setFontWeight("bold").setBackground("#d9ead3");
}

function appendImageOnlyRow_(sheet, file) {
  const fileId = file.getId();
  if (MAKE_IMAGES_PUBLIC_FOR_PREVIEW) { try { file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); } catch (e) {} }
  const row = Math.max(sheet.getLastRow() + 1, START_ROW);
  const imageUrl = "https://drive.google.com/thumbnail?id=" + fileId + "&sz=w600";
  sheet.getRange(row, COL_IMAGE).setFormula('=IMAGE("' + imageUrl + '",4,' + IMAGE_HEIGHT + "," + IMAGE_WIDTH + ")");
  sheet.getRange(row, COL_INFO).setValue("");
  sheet.getRange(row, COL_PHONE).setValue("");
  sheet.getRange(row, COL_IMAGE).setNote("FILE_ID: " + fileId + "\nFILE_NAME: " + file.getName() +
    "\nSTATUS: Fetched\nFETCHED_AT: " + new Date());
  sheet.setRowHeight(row, IMAGE_HEIGHT + 20);
}

function getExistingFileIdRowMap_(sheet) {
  const map = {};
  for (let row = START_ROW; row <= sheet.getLastRow(); row++) {
    const id = getFileIdFromImageCell_(sheet, row);
    if (id) map[id] = row;
  }
  return map;
}

function getFileIdFromImageCell_(sheet, row) {
  let m = (sheet.getRange(row, COL_IMAGE).getNote() || "").match(/FILE_ID:\s*([a-zA-Z0-9_-]+)/);
  if (m) return m[1];
  m = (sheet.getRange(row, COL_IMAGE).getFormula() || "").match(/id=([a-zA-Z0-9_-]+)/);
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
  while (it.hasNext()) { const f = it.next(); if ((f.getMimeType() || "").indexOf("image/") === 0) files.push(f); }
  if (PROCESS_SUBFOLDERS) { const fi = folder.getFolders(); while (fi.hasNext()) collectImageFiles_(fi.next(), files); }
}

/* ====== OPENAI VISION OCR ====== */
function extractInfoFromImage_(file) {
  const blob = file.getBlob();
  const bytes = blob.getBytes();
  const sizeMb = bytes.length / 1024 / 1024;
  if (sizeMb > MAX_IMAGE_MB) throw new Error("Image too large: " + sizeMb.toFixed(2) + " MB");
  const mimeType = blob.getContentType() || file.getMimeType() || "image/jpeg";

  const prompt =
    "Read this image carefully and extract the information.\n\n" +
    "Return valid JSON only, exactly in this format:\n" +
    "{\n" +
    ' "info": "all useful readable information from the image",\n' +
    ' "phone": "all phone numbers found in the image, comma separated"\n' +
    "}\n\n" +
    "Rules:\n" +
    "- Do not invent anything.\n" +
    "- If no phone number is visible, return an empty string for phone.\n" +
    "- Keep the info field clean and readable.\n" +
    "- Phone can be Indian or international.\n" +
    "- Return JSON only.";

  const payload = {
    model: OPENAI_MODEL,
    messages: [{ role: "user", content: [
      { type: "text", text: prompt },
      { type: "image_url", image_url: { url: "data:" + mimeType + ";base64," + Utilities.base64Encode(bytes), detail: "high" } }
    ] }],
    response_format: { type: "json_object" },
    max_tokens: 1200,
    temperature: 0
  };

  const response = UrlFetchApp.fetch("https://api.openai.com/v1/chat/completions", {
    method: "post", contentType: "application/json",
    headers: { Authorization: "Bearer " + OPENAI_API_KEY },
    payload: JSON.stringify(payload), muteHttpExceptions: true
  });
  const status = response.getResponseCode();
  const text = response.getContentText();
  if (status < 200 || status >= 300) throw new Error("OpenAI API error " + status + ": " + text.substring(0, 800));

  const json = JSON.parse(text);
  if (!json.choices || !json.choices[0] || !json.choices[0].message) throw new Error("OpenAI response format not recognized.");
  const content = json.choices[0].message.content || "";
  let parsed;
  try { parsed = JSON.parse(content); } catch (e) { parsed = { info: content, phone: extractPhoneNumbers_(content) }; }
  const info = parsed.info || "";
  let phone = parsed.phone || "";
  if (!phone && info) phone = extractPhoneNumbers_(info);
  return { info, phone };
}

/* ====== PHONE CLEANUP ====== */
function extractPhoneNumbers_(text) {
  if (!text) return "";
  const matches = text.match(/(?:\+?\d[\d\s().-]{7,}\d)/g) || [];
  const cleaned = [];
  matches.forEach(m => {
    const digits = m.replace(/\D/g, "");
    if (digits.length >= 10 && digits.length <= 15) {
      const v = m.trim().replace(/\s+/g, " ").replace(/[().-]/g, "").trim();
      if (cleaned.indexOf(v) === -1) cleaned.push(v);
    }
  });
  return cleaned.join(", ");
}
