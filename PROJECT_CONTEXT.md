# OCR → DLT SMS Automation — Full Project Context

> Paste or load this file into any new Claude chat / project to give it complete context.
> Owner: 99 Consulting Services / 99 Marketing Services (Google account: linkwithmarketing@gmail.com).
> Repo: https://github.com/linkwithmarketing-design/OCR (private). No API keys are stored anywhere in this file or repo.

---

## 1. What the system does

Newspaper classified-ad images (property and matrimonial) are put in Google Drive. Google Apps Script inside two Google Sheets:

1. **Fetch Images** → adds one row per image (thumbnail via `=IMAGE()` + Drive file ID in the cell note).
2. **Process Images** → sends each image to **OpenAI gpt-4o-mini (vision)** → writes ad text (Info) and phone number(s) (Phone).
3. **SMS** → sends a **DLT-approved promotional SMS** to those numbers through the **Telinfy (GreenAds Global)** API, writing per-row status and logging every API call.

```
Drive images → Sheet (Image | Info | Phone) → OpenAI OCR → Telinfy API → Operator DLT scrub → handset
                                                  └─ SMS Status / SMS Sent At + "SMS Logs" tab
```

---

## 2. The two Google Sheets

| | Shaadi sheet | Property sheet |
|---|---|---|
| Title | "Shaadi OCR" (was "Shaadi NeoDove") | "Property NeoDove" |
| Spreadsheet ID | `1FRZ7ErIx9vzN_dA-7eDjvQPyMUIMocGbFieL42G3LxE` | `1LRXRZ2TTRe8lCP5kPOYUvpA4cispuTRN3LgnYdaJSoE` |
| Apps Script project | `1UZ04niHn9lSIYWlFROnrVdxOTB-1cp1XS39W-gPf4kOtvGpIyI_xRLFT` | `1bR4FXxcLlzGWRnpmwnc7bseM-Ipd7DX4i-9113v8x1jMIdKl0I9mV0R3` |
| Data tab | `Sheet1` (gid 0) | `Ads` (gid 755640287) |
| Columns | Image, Info, Phone, SMS Status, SMS Sent At | Image, Info, Phone, Location / Area, SMS Status, SMS Sent At |
| Other tabs | SMS Logs, (empty "Telinfy Reports" leftover) | SMS Logs, SMS Templates, Webhook Logs (old), Areas Master, Collected Properties + Location View (empty since NeoDove removal), Image Review - Property |
| Drive folder | `1EaDHoGrpNvGI6NQ3dT-MvZtAU3U3y3P6` | `1LVWSAFpAX_t4YWbK4pFW_1Pyd7c-MXCx` |
| Template used | Shaadi – Outreach `1677100000000395222` (hard-coded in `SMS_TEMPLATES`) | PEG `1677100000000394325` (row in `SMS Templates` tab) |
| "Sent" status label | `Accepted by Telinfy` | `Sent (queued)` |
| Send-next-100 | Image OCR menu → "Send Next 100 SMS" (`sendNext100Sms` in Code.gs) / editor `sendNext100` | Editor: `sendNext100` |
| Phone cells | may contain several numbers ("98…, 97…") — each is texted | one number per row |

Script URLs: `https://script.google.com/u/0/home/projects/<project id>/edit`
Sheet URLs: `https://docs.google.com/spreadsheets/d/<spreadsheet id>/edit`

**NeoDove** (a calling/CRM tool) used to be wired in (webhook `doPost`, Notes / Calling Status columns). It has been **removed** from both sheets. Don't reintroduce those columns.

---

## 3. Apps Script structure (each sheet's project)

- `Code.gs` — Image OCR (`onOpen`, `fetchImages`, `processImages`, Property also `cleanExistingPhoneNumbers`). `onOpen()` must end with `addSmsMenu_();`.
- `Telinfy_SMS.gs` — SMS menu and logic. Key functions:
  - `addSmsMenu_()` — **SMS** menu: API keys… / (Property: Templates (add / edit)…) / Send test SMS / Bulk send: selected rows / Bulk send: all unsent rows / Mode: switch Live / Dry run
  - `showKeyDialog()` + `saveApiKeys()` — masked dialog; keys go to **Script Properties** `OPENAI_API_KEY`, `TELINFY_API_KEY`
  - `isDryRun_()` / `toggleDryRun()` — Script Property `SMS_DRY_RUN` (`'false'` = Live; default Dry run)
  - `bulkSend_()`, `menuSendTest()`, `sendNextBatch_(sh, tpl, limit, okLabel)`, `sendNext100()`
  - `sendTemplateSms_()` — the Telinfy API call; parses `responses[]` / `bulkResult` per number
  - `loadTemplates_()` / `getTemplatesSheet_()` (Property) — templates from the `SMS Templates` tab
  - `extractIndianMobiles_()`, `normalizeIndianMobile_()` — only 10-digit mobiles starting 6–9; rejects 1800 / landlines
  - `telinfyHistory_()` (29 Oct) — reads Telinfy reports (90 days) before each send: skips DND / not-in-use numbers and numbers already texted with the same template; `smsCheckHistory()` = read-only preview
  - `alreadySentNumbers_` logic — numbers with Sent/Accepted status **plus every number in SMS Logs with Result=OK** are never re-sent
  - `withinPromoWindow_()` — Promotional only 9 AM–9 PM IST
- Rules: one `onOpen` and one `doPost` per project. OCR `setupHeaders_()` may only write its own header cells (Shaadi A1:C1, Property A1:D1) — never the SMS columns.
- Reference copies of the code: `src/` in the repo (`Telinfy_SMS.gs` unified version, `OCR_Property.gs`, `OCR_Shaadi.gs`).

### SMS Status values
`Sent (queued)` / `Accepted by Telinfy` (accepted, never resent) · `Skipped: DND` / `Skipped: number not in use` (from Telinfy reports, 29 Oct+) · `Skipped: duplicate` · `Skipped: invalid number` · `Skipped: missing variable` · `Dry run OK` (eligible again) · `Failed: <reason>` · blank (never tried).

### SMS Logs tab
`Time | Campaign | Numbers | Result (OK/ERROR/EXCEPTION/DRY_RUN) | HTTP Code | Response`. Source of truth for "already sent" — never delete.

---

## 4. DLT (India TRAI) — Tata Tele portal

- Portal: `https://telemarketer.tatateleservices.com` → login as **Principal Entity** ("Principal Entity/TeleMarketer/Aggregator").
- PE: **99 Consulting Services**. Header / Sender ID: **`099559`**.
- Telemarketer: **GreenAds Global (Telinfy)** — a **PE–TM chain** (PE-TM Binding menu) is required; with no chain every SMS failed.
- Find templates: **Content Template → Template Summary** (`#/templates-by-pe`). Register: **Content Template → Content Template Registration**.
- Session is stored **per browser tab**: reloading or opening a deep link in another tab logs out. Navigate inside the logged-in tab; open a template by clicking its URN in Template Summary.
- More than 2 `{#var#}` requires a Justification.

### Approved templates (sender 099559, Promotional, 0 variables)

| Name | Template ID | Text |
|---|---|---|
| Shaadi – Outreach (current) | `1677100000000395222` | Elite Matrimonial Solutions. Confidential Matchmaking with 30+ Years Experience. Sector 18A, Chandigarh. 99 Consulting Services Shaadi-bells.com Call 7770000559, 9417004832, 9815631231. |
| Outreach (old Shaadi) | `1677100000000393293` | 99 Consulting Services - Elite Matrimonial Solutions. Confidential Matchmaking with 30+ Years Experience. Sector 18A, Chandigarh. Call 9417004832, 9815631231, 7770000559. |
| 99ConsultingServices | `1677100000000394217` | 99 Consulting Services: Helping businesses improve and scale with IT consulting, managed IT services, SharePoint, identity and access management, cloud and digital solutions. Connect with us for reliable technology support. Call us on 8080803736 or 7770000559 |
| 99StaffingServices | `1677100000000394219` | 99 Staffing Services: Simplify your hiring with reliable staffing and recruitment support. We help businesses find suitable talent for their workforce requirements across multiple roles and industries. Connect with us for professional hiring assistance. Call us on 8080803736 |
| PEG (Property Experts Group) | `1677100000000394325` | Starts "99 Consulting Services - Property Experts Group. Trusted real estate guidance with 30+ Years Experience. Explore residential and commercial property opportunities…" — exact text in Property sheet's SMS Templates tab / DLT |
| SkylineCapital | `1677100000000394326` | Exact text in DLT Template Summary |

Text must match **exactly** (every character) in DLT, Telinfy and the script.

---

## 5. Telinfy (GreenAds Global)

- Dashboard: `https://hub.telinfy.com` (username `99consulting`). Sessions expire — user logs in themselves (never enter passwords for them).
- **API key:** Settings → Account Settings → **Security → API Keys** (already exists, no generate button). Never paste it in chat, cells or code.
- **Templates:** Templates → Add Template (name, Template ID, Route type, Sender ID, exact text). Re-check the text after typing — once it got changed before saving and would have failed.
- **Campaigns:** Campaigns → Create Campaign → Standard Campaign → name, Route Promotional, Sender 099559, Template (text auto-fills), paste numbers → Send campaign. Report analytics update ~15 min later.
- **Reports:** Reports → Campaign Report (Report Type: Compose / Dynamic / HTTP API / File upload).
- Pricing ≈ ₹0.14–0.17 + GST per SMS part; > 160 chars = 2 parts (all current templates are 157–275 chars).
- Wallet was recharged (≈₹11,000 in Oct 2026).

### API
```
POST https://hub.telinfy.com/unified/developer/api/v1/sms/send
Headers: x-api-key: <key>, Content-Type: application/json
Body: { "Sender_Name":"099559", "SMS_Message":"<exact text>", "mobile_Number":"98…" or ["98…","97…"],
        "template_id":"1677100000000xxxxxx", "campaign_name":"…" }
```
Responses (200):
- single: `{"responses":[{"status":"Success","message":"SMS send successfully","mobile_Number":"…","timestamp":"…"}]}`
- bulk: `{"status":"Success","message":"Bulk SMS send successfully","total_numbers":50,"bulkResult":"Inserted Successfully"}`

"Success" = accepted, **not** delivered. Delivery only in Telinfy Campaigns/Reports.

---

## 6. Postman

- Public collection: Postman API Network → **Telinfy – Platforms By GreenAds Global** → **hub.telinfy.com – APIs & Webhook** → SMS (Direct Messages: Send SMS (Alias – Instant), Send Bulk SMS (Array); Templates: Get Template IDs; Wallet; Reports). Variables `base_url` (`https://hub.telinfy.com/unified/developer`), `api_key`.
- Repo collection: `postman/Telinfy_SMS.postman_collection.json` — set `api_key` and `test_number` as **Current value** only.
- Guide: `docs/POSTMAN.md`.

---

## 7. OpenAI OCR

- Model `gpt-4o-mini`, `response_format: json_object`, `detail: high`, temperature 0.
- Property prompt: one primary phone; info includes type, sale/rent, sector, size, price, facing, furnishing.
- Shaadi prompt: all phone numbers comma-separated.
- 20 images per run (Property); 700 ms sleep; 429 rate-limit rows are written as `ERROR: …` and retried next run.
- Key from Script Properties (`OPENAI_API_KEY`). An earlier key was exposed in code → revoked advice given.

---

## 8. History / key incidents

- 2026-10-05 First dashboard test 4/4 failed → missing PE-TM chain.
- 2026-10-08 Script showed `Failed: HTTP 200` though SMS arrived → fixed response parsing (`responses[]`).
- 2026-10-09 Consulting + Staffing templates added to Telinfy, tests to 7770000559, 8080803736, 9417721565 accepted. PEG + Skyline approved.
- 2026-10-12 Property: **141 numbers texted twice** — OCR `setupHeaders_` overwrote the SMS Status header. Fixed: OCR writes only its own headers; SMS script also checks SMS Logs.
- 2026-10-17 NeoDove columns removed from Property. `sendNext100` added; 100 Shaadi (rows 738–843) + 100 Property (rows 424–687) accepted, 0 failed.
- 2026-10-24 GitHub repo created with code + docs + Postman collection.
- 2026-10-29 DND / not-in-use skip + Telinfy-history dedupe added to both sheets; SMS Logs numbers now stored as text. Dashboard shows Telinfy SMS reports.
- 2026-10-28 Experimental "Telinfy Reports" CSV-import feature removed from the Shaadi script and menu (empty "Telinfy Reports" tab may remain).

---

## 9. Working rules for an AI assistant on this project

- **Never send SMS (or run sendNext100 / bulk send / Telinfy campaigns) unless the user explicitly asks in that message.** Always state template, count and numbers; respect 9 AM–9 PM IST.
- Never put API keys in chat, cells, code, commits or Postman Initial values. Keys only via SMS → API keys…
- Before editing Apps Script, read the current file — the user and other tools edit it too (labels, functions change).
- Keep `onOpen` single; keep `doPost` single; never let OCR code write over SMS columns; never delete SMS Logs.
- Template text must be byte-identical across DLT, Telinfy and code.
- Browser automation notes (Claude in Chrome):
  - Apps Script editor = Monaco: `monaco.editor.getModels()` / `getEditors()[0].executeEdits` to edit; save with the toolbar Save button; run functions via the function dropdown + Run, read the Execution log.
  - Returning code that contains URLs with query strings or base64 is blocked by the extension — read code with `get_page_text` after `ed.layout({width:6000,height:60000})` (indentation is lost).
  - Large image-heavy sheets can freeze the tab; read data via `gviz/tq?tqx=out:csv&sheet=<name>` fetches instead of clicking around.
  - Tata DLT: one tab only, don't reload.
- User communicates briefly in English; give concise, concrete answers.
