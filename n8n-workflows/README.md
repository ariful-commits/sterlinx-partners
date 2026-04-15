# Sterlinx n8n Workflows

n8n runs at `https://n8n.sterlinxglobal.com` on the Sterlinx server (Docker container `n8n`,
port 5678, proxied via nginx on 5679). Both workflows are active.

---

## Workflow A — Zoho Invoice Paid → Partner Commission Sheet

**Workflow ID**: `LyE90t70ctrWrBg5`
**Status**: Active
**Trigger**: HTTP Webhook — Zoho Books fires this when an invoice is marked as paid

**Webhook URL**:
```
https://n8n.sterlinxglobal.com/webhook/LyE90t70ctrWrBg5/webhook/zoho-invoice-paid
```
> The workflow ID prefix is required — n8n registers paths as `{workflowId}/webhook/{path}`.

### What it does (step by step)

| Step | Node | Action |
|------|------|--------|
| 1 | **Webhook** | Receives POST from Zoho Books with invoice payload (`invoice_id`, `account_id`, `date`, `payment_date`, `total`, `sub_total`) |
| 2 | **Fetch Invoice Details** | GET Zoho Books invoice to retrieve line item names for exclusion checking |
| 3 | **Check Exclusion List** | Code node: checks line item names against `EXCLUDED_KEYWORDS`; returns `{skip: true/false, invoice}` |
| 4 | **Skip Check** | IF `skip === false` → continue; otherwise stop (excluded invoice type) |
| 5 | **Get Zoho CRM Account** | Calls Zoho CRM API to fetch the account record for the invoice's `account_id` — retrieves the `Partners` field (CRM contact ID) |
| 6 | **Check Partner Assigned** | IF the account has a `Partners` field value → continue; otherwise stop |
| 7 | **Fetch Config Sheet** | HTTP GET to the production config Google Sheet published CSV |
| 8 | **Parse Config CSV** | Code node: finds the config row where `CRMContactID` matches the partner ID; returns `partnerName`, `partnerSlug`, `partnerEmail`, `sheetUrl`, `commRate` |
| 9 | **Append Commission Row** | Google Sheets append to the partner's commission sheet — writes EntityName, InvoiceID, InvoiceDate, InvoicePaymentDate, AmountReceived, AmountExVAT |
| 10 | **Send Push Notification** | HTTP POST to `http://localhost:8080/push-notify` — triggers browser push to the partner |
| 11 | **Send Email via Postmark** | HTTP POST to Postmark API — emails the partner with commission details and dashboard link |

### Credentials used

| Credential | n8n ID | Type |
|------------|--------|------|
| Zoho OAuth | `7gSiNWgQLxn7Ac2i` | `oAuth2Api` |
| Sterlinx Google SA | `DOsJmGy6243Mz0jB` | `googleApi` (service account) |
| Postmark | `f2UnXydQY3S3CRMd` | `httpHeaderAuth` |

### Configuring in Zoho Books

In Zoho Books: **Settings → Automation → Webhooks → New Webhook**
- Event: Invoice → Payment Received
- URL: `https://n8n.sterlinxglobal.com/webhook/LyE90t70ctrWrBg5/webhook/zoho-invoice-paid`
- Method: POST
- Body format: JSON (include invoice object)

---

## Workflow B — New Zoho Partner → Sheet + Welcome Email

**Workflow ID**: `U5Izw2YaiZ9uCsqi`
**Status**: Active
**Trigger**: HTTP Webhook — Zoho CRM fires this when a new partner contact is created

**Webhook URL**:
```
https://n8n.sterlinxglobal.com/webhook/U5Izw2YaiZ9uCsqi/webhook/zoho-partner-created
```
> The workflow ID prefix is required — n8n registers paths as `{workflowId}/webhook/{path}`.

### What it does (step by step)

| Step | Node | Action |
|------|------|--------|
| 1 | **Webhook** | Receives POST from Zoho CRM with new contact data (name, email, commission rate) |
| 2 | **Get Zoho Contact** | GET Zoho CRM contact record to read the `Contact_Type` field |
| 3 | **Check Contact Type** | IF `Contact_Type === 'Partner'` → continue; otherwise stop |
| 4 | **Generate Credentials** | Code node: derives slug (lowercase hyphenated name) and random password from webhook payload |
| 5 | **Create Commission Sheet** | Google Sheets API — creates a new spreadsheet in the Partners folder named `[Partner Name] Commission` |
| 6 | **Add Headers to Sheet** | Writes the 4 metadata rows and the header row (EntityName, InvoiceID, etc.) to the new sheet |
| 7 | **Add to Config Sheet** | Appends a new row to the production config Google Sheet with the partner's details |
| 8 | **Send Welcome Email** | HTTP POST to Postmark API — sends welcome email with portal URL and password |

### Credentials used

| Credential | n8n ID | Type |
|------------|--------|------|
| Sterlinx Google SA | `DOsJmGy6243Mz0jB` | `googleApi` (service account) |
| Postmark | `f2UnXydQY3S3CRMd` | `httpHeaderAuth` |

### Configuring in Zoho CRM

In Zoho CRM: **Setup → Automation → Workflow Rules → New Rule**
- Module: Contacts
- Trigger: Record Created
- Criteria: Role / Tag = Partner (or whichever field identifies partners)
- Action: Webhook → `https://n8n.sterlinxglobal.com/webhook/U5Izw2YaiZ9uCsqi/webhook/zoho-partner-created`

---

## Exported Workflow Files

| File | Workflow |
|------|---------|
| `invoice-commission.json` | Workflow A |
| `partner-onboarding.json` | Workflow B |

These are point-in-time exports. To re-import if the workflow is lost:
1. n8n UI → Workflows → Import from File
2. Upload the JSON
3. Re-connect credentials (IDs may differ on a fresh instance)
4. Activate the workflow

---

## Credentials Reference

All credentials are stored in n8n and not exported in the JSON files.

| Name | Type | Used by |
|------|------|---------|
| Zoho OAuth | `oAuth2Api` | Workflow A (Zoho CRM API) |
| Sterlinx Google SA | `googleApi` | Both workflows (Google Sheets read/write) |
| Postmark | `httpHeaderAuth` | Both workflows (email) |

### Re-authorising Zoho OAuth

If the Zoho OAuth credential shows as disconnected:
1. n8n → Credentials → `Zoho OAuth` → Edit
2. Click **Connect** / **Reconnect**
3. Complete the Zoho OAuth browser flow
4. Save — both workflows will resume automatically

Zoho OAuth scope required: `ZohoBooks.invoices.READ ZohoCRM.modules.ALL`
Authorization URL must include `prompt=consent` to force re-consent on reconnect.

---

## Monitoring

View execution history in n8n UI: **Workflows → [Workflow Name] → Executions**

Each execution shows:
- Trigger payload received
- Node-by-node output
- Any errors with full stack trace

Common errors:
- `401 Unauthorized` on Zoho node → OAuth token expired → re-authorise credential
- `Partner not found in config` → CRMContactID in config sheet doesn't match Zoho account's Partners field
- `Unable to parse range` → Google Sheet tab name mismatch (must be `Commission_Log`)
