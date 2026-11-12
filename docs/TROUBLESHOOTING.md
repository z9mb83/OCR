# Troubleshooting

Every problem below actually happened while building this. Each entry: **symptom → cause → fix**.

---

## SMS / Telinfy

### Every SMS fails right after switching to a new template
- **Cause:** the template is registered on DLT but was never added in Telinfy, or Telinfy's saved text differs (one space is enough).
  Happened with Shaadi `1677100000000395737` (added in Telinfy on 10 Nov 2026).
- **Fix:** *SMS → Check templates with Telinfy*. ✗ *not in Telinfy* → Telinfy → Templates → Add Template with the same ID, route,
  sender `099559` and exact text. ✗ *text differs at character N* → correct whichever side is wrong. Run the check again until all ✓.

### "Could not check: Telinfy key missing" / "Telinfy answered HTTP 401"
- The check uses the same `TELINFY_API_KEY` Script Property as sending. *SMS → API keys…* → paste the key again. 401/403 = key wrong or expired.

### Rows say `Skipped: DND` or `Skipped: number not in use`
- Telinfy's delivery reports (last 90 days) showed error 650 (DND) or 2/3 (barred / not in use) for that number, and it was never delivered.
  This is intended: Promotional SMS to these numbers are charged but not delivered. Use a Service template for people who contacted you.
- To see what the next send would skip without sending: run `smsCheckHistory()` from the editor.

### All test SMS failed (4/4 "Failed" in the campaign report)
- **Cause:** No **PE–TM chain** on Tata DLT. Operators reject commercial SMS whose route from the Principal Entity (99 Consulting Services) to the telemarketer (GreenAds/Telinfy) isn't registered.
- **Fix:** DLT → *PE-TM Binding → Create New Chain* with GreenAds' TM ID. After approval the same test was delivered.
- **How to confirm:** Telinfy → *Reports → Campaign Report* → Report Type *Compose* → read *Error Code / Error Desc*. Chain / TM / "not authorised" wording = chain problem.

### Template text "changed by itself" in Telinfy's Add Template form
- **Symptom:** Typed `99 Consulting Services - Elite Matrimonial Solutions…`, the field later showed `ShaadiBells Elite Matrimonial Solutions…`.
- **Cause:** Someone edited the field (or autofill) before saving. Telinfy saves whatever is in the box.
- **Fix:** Before **Save template**, re-read the message box against the DLT text. Any difference (a word, a space, a symbol, a trailing newline) = **template mismatch** → every SMS fails.

### Sheet shows `Failed: HTTP 200` but the SMS arrived
- **Cause:** Telinfy single sends reply `{"responses":[{"status":"Success",…}]}` — the status is inside a list, not at the top level. The first script version only looked for a top-level `status`.
- **Fix:** `sendTemplateSms_()` now reads `responses` / `bulkResult` and records a per-number result. If you hit this on old rows, change their status to `Sent` so they're not re-texted.

### Nothing arrives and `SMS Logs` shows `DRY_RUN`
- **Cause:** New installs start in **Dry run**.
- **Fix:** *SMS → Mode: switch Live / Dry run* → "LIVE mode". `sendNext100()` refuses to run in Dry run and says so.

### Duplicate sends — 141 numbers texted twice (Property, 12 Oct 2026) {#duplicate-sends}
- **Cause:** The Property OCR script's `setupHeaders_()` rewrote headers **A1:F1** every run (`… | Notes | Calling Status | Location / Area`). The SMS script had put `SMS Status` in column D; the OCR run renamed D1, the SMS script couldn't find `SMS Status`, created a new empty one, and treated everyone as unsent.
- **Fix:**
  1. OCR scripts now write **only their own header cells** (Property A1:D1, Shaadi A1:C1).
  2. Old NeoDove columns (Notes, Calling Status) were removed.
  3. The SMS script also checks the **`SMS Logs` history**, so even if a status column is lost, logged numbers are never re-sent.
- **Rule:** never rename/delete the `SMS Status` header or the `SMS Logs` tab.

### Rows say `Skipped: invalid number`
- 1800 toll-free (`+91 1800 121 8585`), landlines (`0172…`), foreign numbers, empty Phone cells, or OCR junk. Only 10-digit mobiles starting 6–9 are sent.
- Fix the Phone cell by hand and clear the status cell to retry.

### Promotional SMS not delivered to some numbers
- **DND**: numbers on the Do-Not-Disturb registry won't receive Promotional route SMS (you may still be charged — check with GreenAds). Use a **Service Implicit/Explicit** template for people who contacted you.
- **Time window**: Promotional route only 9 AM – 9 PM IST (the script blocks sends outside it).

### Each message charged as 2 SMS
- Over **160 characters** (GSM) = 2 parts; Unicode (Hindi/Punjabi) = 70 chars per part. Current templates are 157–275 chars. Shorter templates halve the cost.

### "Add your Telinfy key first" / key boxes show "not set"
- Each Apps Script project has its own Script Properties. Enter keys once **per sheet**: *SMS → API keys…*.

### Telinfy dashboard logs you out
- Sessions expire. Log in again at hub.telinfy.com; API calls from the sheet are not affected (they use the API key).

### API key location
- Telinfy → *Settings → Account Settings → Security → API Keys*. The "Developer APIs" sidebar link only opens the Postman docs.

---

## DLT (Tata Tele portal)

### Logged out after reload / opening a direct link
- The portal keeps the session per tab (sessionStorage). Reloading or opening a deep link in another tab logs you out. Navigate via the menu inside the logged-in tab.

### Can't find templates
- *Content Template → **Template Summary*** lists all templates with ID, header, status. "Bulk Template Verification Summary" only shows bulk-upload batches (usually empty).
- If there's no Template menu at all you're logged in as Telemarketer / sub-user — use the **Principal Entity** login.

### "Justification is Mandatory for variable length more than 2"
- Templates with more than two `{#var#}` need text in the *Justification* column before verification.

---

## Image OCR / OpenAI

### `ERROR: OpenAI API error 429 … Rate limit reached for gpt-4o-mini`
- Too many tokens per minute (200k TPM). Rows that start with `ERROR:` are retried automatically next run.
- Raise `SLEEP_MS_BETWEEN_OPENAI_CALLS` (e.g. 2000) or lower `MAX_IMAGES_PER_RUN`.

### "OpenAI API key is missing"
- The key is no longer in the code. *SMS → API keys…* → paste the OpenAI key.
- If a key was ever pasted into the code or a chat, **revoke it** on platform.openai.com and create a new one.

### Images don't show in column A
- `=IMAGE()` needs each Drive file shared "Anyone with the link". `MAKE_IMAGES_PUBLIC_FOR_PREVIEW = true` does this on fetch — only use it for non-private images.

### Script stops after a few minutes
- Apps Script has a 6-minute limit per run. OCR processes 20 images per run, SMS sends up to 500 per run — just run again.

---

## Google Sheets / Apps Script

### Menu missing after adding a file
- Only **one `onOpen()`** per project. Keep the OCR one and call `addSmsMenu_()` at its end. Reload the sheet.

### Webhook stopped working after adding code
- Only **one `doPost()`** per project — merge handlers.

### Sheet tab freezes / screenshots time out
- Sheets with hundreds of `=IMAGE()` thumbnails are heavy. Avoid selecting whole columns; use the Name Box (top-left) to jump to a cell.

### Template ID shows as `1.6771E+18`
- 19-digit IDs lose precision as numbers. The `SMS Templates` tab formats columns B:C as text; if you paste elsewhere, format as Plain text first.

### Collected Properties / Location View tabs are empty
- They filtered on the old NeoDove *Calling Status = Property Details Collected* column, which was removed. Rebuild them to filter on `Location / Area` or delete them.
