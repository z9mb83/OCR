# Telinfy SMS API — what we use

Postman collection: *Telinfy – Platforms By GreenAds Global → hub.telinfy.com – APIs & Webhook → SMS*. How to use it, plus our own importable collection: [POSTMAN.md](POSTMAN.md).

## Send SMS

```
POST https://hub.telinfy.com/unified/developer/api/v1/sms/send
x-api-key: <Telinfy API key>
Content-Type: application/json
```

### Request

```json
{
  "Sender_Name":   "099559",
  "SMS_Message":   "<exact DLT text with variables filled>",
  "mobile_Number": "9876543210",
  "template_id":   "1677100000000xxxxxx",
  "campaign_name": "Sheet_20261017_1120"
}
```

`mobile_Number` can be a single string or an array (bulk). The script sends batches of 50.

### Responses seen in production

**Single number (200):**
```json
{"responses":[{"status":"Success","message":"SMS send successfully","mobile_Number":"8168429342","timestamp":"2026-10-08T04:47:25.669Z"}]}
```

**Bulk (200):**
```json
{"status":"Success","message":"Bulk SMS send successfully","total_numbers":50,"bulkResult":"Inserted Successfully"}
```

**Note:** "Success" means *accepted for sending*. Delivery (or DLT/DND rejection) only shows in Telinfy Campaigns / Reports.

## Other endpoints in the collection (not used by the script yet)

| Folder | Use |
|---|---|
| SMS → Templates → Get Template IDs | List templates registered in Telinfy |
| SMS → Wallet | Check balance |
| SMS → Reports | Pull delivery reports (could be used to write Delivered/Failed back to the sheet) |

## Base URLs

- `hub.telinfy.com` account → `https://hub.telinfy.com/unified/developer`
- `one.telinfy.com` (Cloud) accounts use a different collection/base URL.
