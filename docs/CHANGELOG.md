# Changelog

## 2026-10-24
- Added Postman guide (`docs/POSTMAN.md`) and importable collection (`postman/`).
- Repository created: unified `Telinfy_SMS.gs`, OCR scripts for both sheets, full docs.

## 2026-10-17
- Property: removed NeoDove columns (Notes, Calling Status); OCR now writes only A1:D1.
- Root-caused 141 duplicate sends on 12 Oct (header overwrite) — see Troubleshooting.
- Added `sendNext100()` / `sendNextBatch_()` — sends the next 100 untouched rows, checks `SMS Logs` history to never re-text.
- Sent 100 (Shaadi, rows 738–843) + 100 (Property PEG, rows 424–687): 200 accepted, 0 failed.

## 2026-10-12 – 10-16
- Property went Live with PEG template; multiple bulk runs (366 unique numbers by 16 Oct).
- Shaadi switched to new template `1677100000000395222`; status label "Accepted by Telinfy"; multi-number phone cells supported.

## 2026-10-10
- Property sheet: SMS menu added, `SMS Templates` tab (templates editable without code), stricter phone check (rejects 1800/landlines).
- OpenAI key moved out of the Property code into Script Properties.

## 2026-10-09
- New DLT templates approved (99ConsultingServices, 99StaffingServices), added in Telinfy, test campaigns sent to 3 numbers — all accepted.
- PEG and SkylineCapital approved later the same day.

## 2026-10-08
- `Telinfy_SMS.gs` installed in the Shaadi sheet; OpenAI key moved to Script Properties.
- Fixed "Failed: HTTP 200" (Telinfy `responses[]` format).

## 2026-10-05
- Telinfy account / API key located; Tata DLT reviewed — one approved template, **no PE–TM chain**.
- First dashboard test: 4/4 failed (chain missing).

## 2026-07-21
- Property OCR + NeoDove webhook (calling results written back to the sheet).
