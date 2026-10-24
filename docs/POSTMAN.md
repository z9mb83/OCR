# Using Postman with Telinfy

Postman is how we explored and tested the Telinfy SMS API **before** wiring it into Google Sheets. Use it to:

- test a new DLT template on your own number without touching the sheets,
- see Telinfy's raw response when something fails,
- check template IDs and wallet balance.

The Apps Script (`src/Telinfy_SMS.gs`) makes exactly the same call as request **1** below.

## 1. Telinfy's public collection (reference)

Postman → API Network → **Telinfy – Platforms By GreenAds Global** → collection **hub.telinfy.com – APIs & Webhook** → folder **SMS**:

| Folder | Request | What it's for |
|---|---|---|
| Direct Messages | **Send SMS (Alias – Instant)** | Send to one number |
| Direct Messages | **Send Bulk SMS (Array)** | Send to a list of numbers |
| Templates | Get All Templates / **Get Template IDs** | List templates registered in Telinfy |
| Wallet | Balance | Check credit |
| Reports | — | Delivery reports |

Collection variables: `base_url` (default `https://hub.telinfy.com/unified/developer`) and `api_key`. Accounts on **one.telinfy.com** use the separate *one.telinfy.com (Cloud)* collection.

> The collection's overview page didn't explain how to get a key — it's in the Telinfy dashboard: **Settings → Account Settings → Security → API Keys**. The sidebar "Developer APIs" link only opens this Postman collection.

## 2. Our ready-made collection (this repo)

`postman/Telinfy_SMS.postman_collection.json` — two requests pre-filled with our sender ID and the Shaadi template.

1. Postman → **Import** → select the file.
2. Open the collection → **Variables** tab → set **Current value** (not Initial value) of:
   - `api_key` — your Telinfy key (Current value stays on your machine only)
   - `test_number` — your own 10-digit mobile
   - `template_id` + `message` — if testing a different template (text must match DLT exactly)
3. Send **1. Send SMS – single number**.

Never put the real key into the *Initial value* or commit it back to the repo.

## 3. Reading the response

| Response | Meaning |
|---|---|
| `200` `{"responses":[{"status":"Success",…}]}` | Accepted (single). Delivery shows later in Telinfy → Campaigns. |
| `200` `{"status":"Success","message":"Bulk SMS send successfully",…}` | Accepted (bulk). |
| `401` / `403` | Wrong or missing `x-api-key`, or IP whitelisting is blocking you. |
| `200` but SMS never arrives | DLT problem — template text mismatch, no PE-TM chain, DND number, or outside 9 AM–9 PM for Promotional. See [TROUBLESHOOTING.md](TROUBLESHOOTING.md). |

Always confirm actual delivery in **Telinfy → Reports → Campaign Report** (Report Type *HTTP API* for Postman/API sends).

## 4. Typical workflow for a new template

1. DLT approves the template → copy ID + exact text.
2. Add it in Telinfy → Templates.
3. **Postman**: set `template_id` and `message`, send to your own number → confirm it arrives.
4. Add the row in the sheet's **SMS Templates** tab and use the SMS menu for bulk.
