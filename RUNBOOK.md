# Sterlinx Partner Portal — Runbook

Operational guide for Sterlinx staff. No coding knowledge required for most tasks.

---

## Adding a New Partner

### Step 1 — Create the partner's Google Sheet

1. Make a copy of an existing partner sheet (e.g. Anil Demir's)
2. Clear all invoice rows, keeping the 4 metadata rows at the top
3. Update row 1: `Partner Name` → partner's full name
4. Update row 2: `CRM Record` → link to their Zoho CRM contact
5. Update row 3: `Commission Rate` → their agreed rate (e.g. `20%`)
6. Update row 4: `Payment Terms` → e.g. `30 days after client payment received`

### Step 2 — Publish the sheet as CSV

1. In Google Sheets: **File → Share → Publish to web**
2. Select the correct tab (e.g. `Commission_Log`)
3. Format: **Comma-separated values (.csv)**
4. Click **Publish**, copy the URL

### Step 3 — Add the partner to the config sheet

Open the master config sheet and add a new row:

| PartnerName | PartnerURL | SheetURL | CommissionRate | SheetTab | Password |
|-------------|-----------|----------|----------------|----------|----------|
| Jane Smith | `jane-smith` | `[published CSV URL]` | `20` | `Commission_Log` | `Jane2024` |

Rules for `PartnerURL`:
- Lowercase, hyphens only, no spaces
- This becomes their URL: `partners.sterlinxglobal.com/jane-smith`

### Step 4 — Tell the partner

Send them:
- Their URL: `https://partners.sterlinxglobal.com/jane-smith`
- Their password

That's it — no server changes, no code deployment needed.

---

## Adding a New Invoice Row to a Partner Sheet

Open the partner's Google Sheet and add a row beneath the existing data (below the header row 5).

Fill in the following columns:

| Column | Field | Example |
|--------|-------|---------|
| A | `EntityName` | `Noctur Ltd` |
| B | `InvoiceID` | `Inv 91800` |
| C | `InvoiceDate` | `15/04/2026` |
| D | `InvoicePaymentDate` | `20/04/2026` (fill when client pays) |
| E | `AmountExVAT` | `£690.00` |
| F | `CommissionAmount` | `£138.00` |
| G | `CommissionDueDate` | `20/05/2026` (30 days after client pays) |
| H | `CommissionPaidDate` | *(leave blank until paid)* |
| I | `PartnersInvoiceID` | *(leave blank until paid)* |

**Date format:** always DD/MM/YYYY.

The dashboard refreshes on every page load — changes appear immediately.

---

## Marking Commission as Paid

When you pay a partner their commission:

1. Open their Google Sheet
2. Find the relevant invoice row
3. Enter the payment date in **column H (`CommissionPaidDate`)** — format: `DD/MM/YYYY`
4. Optionally enter the partner's invoice reference in **column I (`PartnersInvoiceID`)**

The status will automatically change from **Due for Payment** → **Paid** on the dashboard.
The Partner Ref value only appears on the dashboard once status is Paid.

---

## Deploying a Code Change

### Who makes code changes

Code changes are made by Claude Code (AI assistant with SSH and GitHub access).
Do not manually edit files on the server — always go through GitHub.

### Workflow

1. Claude Code edits `index.html` or `server.js` locally in VS Code
2. Changes are committed and pushed to GitHub (`ariful-commits/sterlinx-partners`, `main` branch)
3. SSH into the server and run the deploy script:

```bash
ssh -p 2222 root@91.98.170.58
/var/www/sterlinx-partners/deploy.sh
```

The script:
- Pulls the latest code from GitHub
- Restarts the Node.js server via PM2
- Prints a confirmation with timestamp

### If deploy.sh fails (git pull error)

The deploy key may have expired or GitHub SSH isn't set up. Check:
```bash
ssh -T -i ~/.ssh/github_deploy git@github.com
```
Should respond: `Hi ariful-commits! You've successfully authenticated...`

---

## Checking Server Health

### Quick status check

```bash
ssh -p 2222 root@91.98.170.58
pm2 list
```

Expected output — both processes should show `online`:

```
┌──┬────────────────────┬──────┬───────┬─────────┐
│  │ name               │ mode │ uptime│ status  │
├──┼────────────────────┼──────┼───────┼─────────┤
│2 │ cloudflared-tunnel │ fork │ Xh    │ online  │
│5 │ sterlinx-server    │ fork │ Xm    │ online  │
└──┴────────────────────┴──────┴───────┴─────────┘
```

### View recent logs

```bash
pm2 logs sterlinx-server --lines 30
```

Error lines to look out for:
- `EADDRINUSE` — port 8080 already in use (safe after a normal restart, clears itself)
- `Could not load` — Google Sheets fetch failed
- `Upstream timeout` — Google Sheets took >10s to respond

### Test the app is responding

```bash
curl -s http://localhost:8080 | head -3
# Should return: <!DOCTYPE html>

curl -s "http://localhost:8080/sheet-proxy?url=https://docs.google.com/..." | head -2
# Should return CSV data
```

### Restart a process manually

```bash
pm2 restart sterlinx-server
pm2 restart cloudflared-tunnel
```

### Firewall status

```bash
ufw status verbose
```

Current expected rules:
- Port `2222` allowed from one specific IP only
- Ports `80`/`443` allowed on localhost interface only
- Default: deny all incoming

---

## Column Reference — Commission Sheet

Row 5 of each partner's sheet is the header row. Rows 1–4 are metadata (skipped by the portal).

| Col | Header | Required | Notes |
|-----|--------|----------|-------|
| A | `EntityName` | Yes | Client company name |
| B | `InvoiceID` | Yes | Must be non-empty for row to appear |
| C | `InvoiceDate` | Yes | DD/MM/YYYY |
| D | `InvoicePaymentDate` | Yes | DD/MM/YYYY — when client paid Sterlinx |
| E | `AmountExVAT` | Yes | Invoice value ex VAT, e.g. `£690.00` |
| F | `CommissionAmount` | Yes | Partner's commission, e.g. `£138.00` |
| G | `CommissionDueDate` | Yes | When commission is owed to partner (DD/MM/YYYY) |
| H | `CommissionPaidDate` | — | Fill when paid — **triggers Paid status** |
| I | `PartnersInvoiceID` | — | Partner's own invoice ref, shown on dashboard when Paid |

Any row where `EntityName` is blank, `InvoiceID` is blank, or `EntityName` equals `TOTALS`
is automatically excluded from the dashboard.

---

## Status Definitions

Status is calculated automatically from the dates — do not add a manual status column.

| Status | Shown when | Badge colour |
|--------|-----------|-------------|
| **Not Due** | `CommissionDueDate` is in the future (or blank) | Amber |
| **Due for Payment** | `CommissionDueDate` has passed and `CommissionPaidDate` is blank | Green |
| **Paid** | `CommissionPaidDate` has any date value | Blue |

---

## KPI Cards

| Card | Calculation |
|------|-------------|
| Total earned | Sum of `CommissionAmount` for all rows |
| Paid to you | Sum of `CommissionAmount` where status = Paid |
| Due for payment | Sum of `CommissionAmount` where status = Due for Payment |
| Not due yet | Sum of `CommissionAmount` where status = Not Due |

---

## Common Issues

| Symptom | Likely cause | Fix |
|---------|-------------|-----|
| Dashboard shows "Could not load commission data" | Sheet not published as CSV | File → Share → Publish to web in Google Sheets |
| Partner not found | Slug in URL doesn't match `PartnerURL` column exactly | Check case and spelling in config sheet |
| All commissions show "Not Due" | `CommissionDueDate` column is empty or misnamed | Ensure column header is exactly `CommissionDueDate` |
| Password screen shows sign-out button | Older cached version of the page | Hard refresh (Ctrl+Shift+R) |
| Site down (Cloudflare error) | `cloudflared-tunnel` crashed | `pm2 restart cloudflared-tunnel` |
| Deploy script fails | GitHub deploy key issue | Check `ssh -T -i ~/.ssh/github_deploy git@github.com` |

---

## Contact & Escalation

| Need | Contact |
|------|---------|
| Add / remove a partner | Update the config Google Sheet (no code change needed) |
| Invoice data changes | Edit the partner's Google Sheet directly |
| Code change or bug fix | Claude Code — describe what needs to change |
| Server access issues | SSH key holder only — port 2222, IP-restricted |
| Billing / infrastructure | Hetzner Cloud console + Cloudflare dashboard |
