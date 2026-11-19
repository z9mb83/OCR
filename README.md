# Sheets OCR → DLT SMS Automation

Google Apps Script tooling used by **99 Consulting Services** to turn newspaper classified-ad images into contact lists and send **DLT-compliant bulk SMS** through **Telinfy (GreenAds Global)** — all from inside Google Sheets.

```
 Drive folder of ad images
          │  Image OCR → Fetch Images
          ▼
 Google Sheet  (Image | Info | Phone | …)
          │  Image OCR → Process Images   (OpenAI gpt-4o-mini vision)
          ▼
 Phone numbers cleaned & de-duplicated
          │  SMS → Bulk send  /  sendNext100()
          ▼
 Telinfy API  ──►  Operator (Tata DLT scrubbing)  ──►  Handset
          │
          └─► SMS Status / SMS Sent At columns + "SMS Logs" tab
```

## What's in here

> **New chat / new project?** Load [`PROJECT_CONTEXT.md`](PROJECT_CONTEXT.md) — it has every ID, template, API detail and rule in one file.

| Path | What it is |
|---|---|
| [`src/Telinfy_SMS.gs`](src/Telinfy_SMS.gs) | SMS menu: private API keys, templates tab, dry run / live, bulk send, `sendNext100()`, logging |
| [`src/SmsApi.gs`](src/SmsApi.gs) | Web app for the dashboard's **Send SMS → Send next 100** button (19 Nov 2026). Same file in both projects, only `SMS_API_BRAND` differs (`SB` Shaadi, `PE` Property). Runs the sheet's own `sendNextBatch_`; key from menu **SMS → Dashboard access key** |
| [`src/OCR_Property.gs`](src/OCR_Property.gs) | Image OCR for the **Property** sheet (Image, Info, Phone, Location / Area) |
| [`src/OCR_Shaadi.gs`](src/OCR_Shaadi.gs) | Image OCR for the **Shaadi** (matrimonial) sheet (Image, Info, Phone) |
| [`docs/SETUP.md`](docs/SETUP.md) | Step-by-step install: DLT, Telinfy, Apps Script, keys, templates |
| [`docs/USAGE.md`](docs/USAGE.md) | Day-to-day: fetching images, sending SMS, sending the next 100 |
| [`docs/TROUBLESHOOTING.md`](docs/TROUBLESHOOTING.md) | Every problem hit so far, with cause and fix |
| [`docs/DLT_TEMPLATES.md`](docs/DLT_TEMPLATES.md) | Registered DLT templates, IDs, and how to add new ones |
| [`docs/API_REFERENCE.md`](docs/API_REFERENCE.md) | Telinfy SMS API — request/response shapes seen in production |
| [`docs/POSTMAN.md`](docs/POSTMAN.md) | Testing the Telinfy API in Postman (collection, variables, reading responses) |
| [`postman/Telinfy_SMS.postman_collection.json`](postman/Telinfy_SMS.postman_collection.json) | Importable Postman collection (no key inside) |
| [`docs/CHANGELOG.md`](docs/CHANGELOG.md) | History of changes |

## Deployed instances

| Sheet | Data tab | Template used | Status label |
|---|---|---|---|
| Shaadi NeoDove | `Sheet1` | Shaadi – Outreach ShaadiBells (`1677100000000395737`) | `Accepted by Telinfy` |
| Property NeoDove | `Ads` | PEG (`1677100000000394325`) | `Sent (queued)` |

Both sheets use sender ID / header **`099559`** on the **Promotional** route.

## Quick start

1. Open the sheet → **Extensions → Apps Script**.
2. Add the matching `OCR_*.gs` as `Code.gs` and `src/Telinfy_SMS.gs` as a second file.
3. Fill in `SPREADSHEET_ID`, `DRIVE_FOLDER_ID`, `TARGET_SHEET_GID` (and `DATA_TAB_NAME` in `Telinfy_SMS.gs`).
4. Reload the sheet → **SMS → API keys…** → paste the OpenAI and Telinfy keys.
5. **SMS → Templates (add / edit)…** → add your DLT template row, then **SMS → Check templates with Telinfy** (all rows must show ✓).
6. Test in **Dry run**, then **SMS → Mode: switch Live / Dry run**.

Full details: [docs/SETUP.md](docs/SETUP.md).

## Logins

| What | Where | Login |
|---|---|---|
| Telinfy (SMS sending, templates, reports) | https://hub.telinfy.com | username `99consulting` (password: ask the admin, never in this repo) |
| DLT (template registration) | Tata Tele DLT portal | Principal Entity login |
| Sheets / Apps Script | Google | linkwithmarketing account |

## Safety rules built in

- API keys live in **Script Properties** only — never in a cell or in the code.
- New installs start in **Dry run**; nothing is sent until you switch to Live.
- A number is never texted twice: the script checks the SMS Status column **and** the full `SMS Logs` history.
- Promotional templates are blocked outside **9 AM – 9 PM IST**.
- Numbers Telinfy reported as DND or not in use (last 90 days) are skipped (`Skipped: DND`).
- 1800 toll-free numbers, landlines and malformed numbers are skipped.
- OCR scripts only write their own header cells, so they can't overwrite the SMS columns.

> ⚠️ Keep this repository **private**. It documents business sender IDs, template IDs and phone numbers. Never commit API keys.
