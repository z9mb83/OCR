# CLAUDE.md - OCR (newspaper ads → OCR → Telinfy SMS)

Read `PROJECT_CONTEXT.md` first - it is the full, detailed context (sheet IDs, Apps Script projects, functions, DLT templates,
rules). Then `docs/` (SETUP, USAGE, DLT_TEMPLATES, API_REFERENCE, POSTMAN, TROUBLESHOOTING, CHANGELOG).

## In one paragraph
Newspaper classified-ad images (property and matrimonial) are dropped in Google Drive. Apps Script in two sheets
("Shaadi OCR" and "Property NeoDove") fetches the images, reads the ad text and phone numbers with OpenAI vision, and sends a
DLT-approved promotional SMS through **Telinfy** (GreenAds Global, login username 99consulting). Code is in `src/`
(`OCR_Shaadi.gs`, `OCR_Property.gs`, `Telinfy_SMS.gs`); it runs inside each sheet's own Apps Script project.

## Rules specific to this repo
- Keys (`OPENAI_API_KEY`, `TELINFY_API_KEY`) only in Script Properties, through the SMS menu dialog. Never in code or cells.
- Promotional SMS only 9 AM - 9 PM IST. Dry run is the default (`SMS_DRY_RUN`); switching to Live is the owner's call.
- Never re-text a number: skip numbers with Sent/Accepted status, numbers in SMS Logs with Result OK, and DND / not-in-use
  numbers from Telinfy reports (`telinfyHistory_`).
- One `onOpen` and one `doPost` per Apps Script project. NeoDove was removed - do not bring its columns back.
- Templates: Shaadi `1677100000000395737`, Property (PEG) `1677100000000394325`. `checkTemplatesWithTelinfy` checks them.

## How it connects to the rest
- The owner sends SMS first from these sheets (Shaadi OCR → SB, Property → PE), then copies the numbers into the SB / PE tabs
  of the Automation Control Center (repo `unified-communication-automation`) for WhatsApp.
- Keep this project's sheets separate from the Automation Control Center; its SMS reports are shown on the dashboard
  (repo `automation-dashboard`, SMS page, split per template).
- 19 Nov 2026: repo copied to GitHub z9mb83 with full history.
- 19 Nov 2026: `src/SmsApi.gs` added to both Apps Script projects (`SMS_API_BRAND` = `SB` / `PE`), deployed as a web app
  (Execute as Me, access Anyone, `?key=` = Script Property `SMS_API_KEY`, menu SMS → Dashboard access key). The dashboard's
  **Send SMS** page calls `status` and `sendnext` (= the sheet's own Send Next 100). It refuses Dry run and outside 9 AM - 9 PM.
  Only one `doPost`/`doGet` per project: they live in SmsApi.gs.

## Owner and how to work with him

- Owner: the 99 group of brands (99 Consulting / 99 Marketing Services). Brand codes used everywhere:
  **SB** Shaadi Bells · **99M** 99 Marketing Services · **99S** 99 Staffing Services · **PE** Property Experts Group · **SC** Skyline Capital (business buying/selling).
- The sheets, Apps Script projects and Gmail senders belong to the owner's main Google account (the 99 Marketing "linkwithmarketing" account).
- GitHub: this repo was copied with its full history from `linkwithmarketing-design/<repo>` to `z9mb83/<repo>` on 19 Nov 2026
  (a fresh copy, not a GitHub transfer). The old copy still exists; new work goes to **z9mb83**.
- The owner is not a programmer. Explain in plain words and give the result, not a list of steps you took.
- He wants a simple internal tool, not a product: only what he asks for, as little code and as few files as possible, no Docker or
  other maintenance-heavy setups. Keep old code (move it to `archive/`) instead of deleting it.
- **He does not pay for anything.** Free tiers only (Apps Script, Vercel Hobby, free Cloud Run/Cloud Shell use). No paid GitHub Actions/Codespaces.
- Update `README.md` (and `TROUBLESHOOTING.md` where there is one) with every change, in plain language.

### Hard rules (from the owner, always in force)
- Never commit or print secrets. Keys live in Apps Script **Script Properties**, **Vercel environment variables** or **Secret Manager** - never in code, git or normal sheet cells.
- Never put raw Meta access tokens, Google OAuth refresh tokens or SMS API secrets in spreadsheet cells.
- The owner types API keys, passwords and OAuth / device codes himself. Claude never does.
- No live emails, WhatsApp or SMS to real customers, no production campaign switched on, and no redeploy of the running email service or its scheduler without a separate, explicit go-live instruction.
- Never overwrite existing leads, statuses, approval values or formulas in the sheets. Never delete sheet tabs the automation reads.
- Never force-push or overwrite unrelated work. Work on a branch and open a pull request; **merge only when the owner says "merge"**.
- Do not rotate or destroy production credentials without his authorization.

### How changes usually reach production
Most logic runs in **Google Apps Script**, which is not connected to git. The usual loop (done through Claude in Chrome, signed in to the owner's main Google account):
1. Make the change in the repo file and test it offline (each repo has a `test/` or `tests/` folder).
2. Apply the same change in the Apps Script editor (exact text replacement in the editor, then the **Save project to Drive** button; reload to check it saved).
3. If the script is a web app: **Deploy → Manage deployments → Edit (pencil) → Version: New version → description → Deploy**. Editing the existing deployment keeps the `/exec` URL the same.
4. Commit, push the branch, open a PR, wait for "merge". The repo must always match what is live.
