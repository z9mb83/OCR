# Setup

Order matters: DLT → Telinfy → Apps Script. A template that is approved on DLT but missing (or different) in Telinfy will fail, and so will one that's in Telinfy but not linked through the DLT telemarketer chain.

## 1. DLT (Tata Tele — telemarketer.tatateleservices.com)

Log in as **Principal Entity** (99 Consulting Services).

1. **Header** — `099559` must be approved (SMS Header menu).
2. **Content template** — *Content Template → Content Template Registration*
   - Communication type: **Promotional** (or Service Implicit / Transactional where it fits)
   - Category: e.g. *Real Estate*, *Communication / Broadcasting / Entertainment / IT*
   - Header: `099559`
   - Template text: use `{#var#}` for variable parts. Justification is mandatory if there are more than 2 variables.
   - Wait for **Status = Active** and a 19-digit **Template ID** (`1677100000000xxxxxx`).
3. **Find approved templates** — *Content Template → Template Summary* (not "Bulk Template Verification Summary", which only tracks bulk uploads).
4. **PE–TM chain** — *PE-TM Binding → PE TM Binding List* must contain a chain to GreenAds / Telinfy. Without it every message is rejected by the operator. GreenAds supplies their TM ID.

> The Tata DLT portal keeps the login per browser tab. Reloading a tab or opening a deep link in a new tab logs you out — navigate inside the logged-in tab instead.

## 2. Telinfy (hub.telinfy.com)

1. **API key** — *Settings → Account Settings → Security → API Keys*. It already exists; there is no "generate" button. Copy it — never paste it into chat, cells or code.
2. **Wallet** — *Billing & Subscription*. Roughly ₹0.14–0.17 + GST per SMS part; a message over 160 characters counts as 2 parts.
3. **Templates** — *Templates → Add Template*, for every DLT template you will use:
   - Template name: any
   - Template ID: the 19-digit DLT ID
   - Route type: same as DLT (Promotional)
   - Sender ID: `099559`
   - Message content: paste the DLT text **exactly** (check it after pasting — see Troubleshooting #template-text-changed).
4. *(Optional)* Ask GreenAds to disable IP whitelisting for the key — Apps Script calls come from changing Google IPs.

## 3. Apps Script (in each Google Sheet)

1. Sheet → **Extensions → Apps Script**.
2. `Code.gs` ← contents of `src/OCR_Property.gs` or `src/OCR_Shaadi.gs`. Set:
   - `SPREADSHEET_ID` — from the sheet URL `/d/<ID>/edit`
   - `DRIVE_FOLDER_ID` — from the Drive folder URL `/folders/<ID>`
   - `TARGET_SHEET_GID` — the `gid=` number of the data tab
3. **+ → Script** → name it `Telinfy_SMS` ← contents of `src/Telinfy_SMS.gs`. Set:
   - `DATA_TAB_NAME` — `Ads` (Property) or `Sheet1` (Shaadi)
   - `SMS_OK_LABEL` — `Sent (queued)` or `Accepted by Telinfy` (both are recognised as "sent")
   - `DEFAULT_TEMPLATE_NAME` — Name of the template `sendNext100()` should use
4. Make sure `onOpen()` in `Code.gs` ends with `addSmsMenu_();` — **only one `onOpen` per project**.
5. Only one `doPost()` is allowed per project too — merge any webhook code into a single function.
6. Save, reload the sheet, approve the authorisation prompt.

## 4. Keys and templates (inside the sheet)

1. **SMS → API keys…** → paste the OpenAI key and the Telinfy key → Save. Each Apps Script project has its own storage, so do this once per sheet.
2. **SMS → Templates (add / edit)…** → creates the `SMS Templates` tab. One row per template:

| Name | Template ID | Sender ID | Route | Message Text (exact DLT) | Variable Columns | Active |
|---|---|---|---|---|---|---|
| PEG | 1677100000000394325 | 099559 | Promotional | *exact text* | *(blank)* | Yes |

   If the text has `{#var#}`, list the data-tab column headers that fill them, in order, e.g. `Location / Area, Callback Number`. Rows where the placeholder count doesn't match are ignored.

## 5. First test

1. Mode stays **Dry run** by default. Run **SMS → Send test SMS** with your own number → check the `SMS Logs` tab (`DRY_RUN` row with the full payload).
2. **SMS → Mode: switch Live / Dry run** → "LIVE mode".
3. **SMS → Send test SMS** again with 1–3 of your own numbers. Log should show `OK  200` and `"status":"Success"`.
4. Check **Telinfy → Campaigns / Reports** after ~15 minutes for Delivered / Failed.
