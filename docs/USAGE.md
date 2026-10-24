# Usage

## Image OCR menu

| Item | What it does |
|---|---|
| **Fetch Images** | Adds a row (thumbnail + Drive file ID in the cell note) for every new image in the Drive folder. Already-fetched images are skipped. |
| **Process Images** | Sends up to 20 unprocessed images per run to OpenAI and fills Info + Phone. Rows that say `ERROR:` are retried next run. Run again until it says all images were checked. |
| **Clean Existing Phone Numbers** *(Property)* | Normalises the Phone column (removes +91 / leading 0 / symbols). |

## SMS menu

| Item | What it does |
|---|---|
| **API keys…** | Masked boxes for the OpenAI and Telinfy keys (stored privately). Leave a box blank to keep the current key. |
| **Templates (add / edit)…** | Opens the `SMS Templates` tab. |
| **Send test SMS** | Type numbers by hand, sends the chosen template to just those. |
| **Bulk send: selected rows** | Sends to the rows you highlighted on the data tab. |
| **Bulk send: all unsent rows** | Sends to every row without a final status (up to 500 per run). Asks for confirmation with the count first. |
| **Mode: switch Live / Dry run** | Toggles. Dry run logs the payload to `SMS Logs` and sends nothing. |

Run bulk sends **from the data tab** (the one with the `Phone` column).

## Send the next 100 (no pop-ups)

1. **Extensions → Apps Script** → open `Telinfy_SMS.gs`.
2. Function dropdown → **sendNext100** → **Run**.
3. The Execution log shows e.g. `Template: PEG | Accepted: 100 | Failed: 0 | Skipped (marked): 166 | Rows 424–687`.

It takes rows top-to-bottom whose **SMS Status is empty**, skips anyone already texted (status column + `SMS Logs`), marks invalid/duplicate rows as `Skipped: …`, and stops at exactly 100 numbers. Requires Live mode and 9 AM–9 PM IST.

## SMS Status values

| Value | Meaning | Re-sent by bulk? |
|---|---|---|
| `Sent (queued)` / `Accepted by Telinfy` | Telinfy accepted it | No |
| `Skipped: duplicate` | Number already texted (this or another row) | No |
| `Skipped: invalid number` | Not a 10-digit Indian mobile (incl. 1800 / landlines) | No |
| `Skipped: missing variable` | Template variable column was empty | No |
| `Dry run OK` | Logged in dry run only | Yes |
| `Failed: …` | Telinfy rejected it — reason included | Yes (menu), No (`sendNext100` only takes empty rows) |
| *(blank)* | Never tried | Yes |

## SMS Logs tab

`Time | Campaign | Numbers | Result | HTTP Code | Response` — one row per API call. `Result` is `OK`, `ERROR`, `EXCEPTION` or `DRY_RUN`. This tab is also the source of truth used to prevent repeat sends — **don't delete it**.

## Delivery reports

The API response only means *accepted*. Actual delivery (Delivered / Failed / DND) is in **Telinfy → Campaigns** (updates ~15 min) or **Reports → Campaign Report → Report Type: Compose / HTTP API**.
