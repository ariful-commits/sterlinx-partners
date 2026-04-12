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
2. Select the correct tab (`Commission_Log`)
3. Format: **Comma-separated values (.csv)**
4. Click **Publish**, copy the URL

### Step 3 — Add the partner to the config sheet

Open the master config sheet and add a new row:

| PartnerName | PartnerURL | SheetURL | CommissionRate | SheetTab | Password | CRMContactID |
|-------------|-----------|----------|----------------|----------|----------|--------------|
| Jane Smith | `jane-smith` | `[published CSV URL]` | `20` | `Commission_Log` | `Jane2024` | `[Zoho contact ID]` |

Rules for `PartnerURL`:
- Lowercase, hyphens only, no spaces
- This becomes their URL: `partners.sterlinxglobal.com/jane-smith`

`CRMContactID` — find this in Zoho CRM on the partner's contact record URL. Used by n8n to
match invoice webhooks to the correct partner. Leave blank if not using automation.

### Step 4 — Tell the partner

Send them:
- Their URL: `https://partners.sterlinxglobal.com/jane-smith`
- Their password

No server changes or code deployment needed.

---

## Adding a New Invoice Row to a Partner Sheet

Open the partner's Google Sheet and add a row beneath the existing data (below the header row 5).

| Column | Field | Example / Notes |
|--------|-------|---------|
| A | `EntityName` | `Noctur Ltd` |
| B | `InvoiceID` | `Inv 91800` |
| C | `InvoiceDate` | `15/04/2026` |
| D | `InvoicePaymentDate` | `20/04/2026` (fill when client pays) |
| E | `PaymentDueDate` | *(auto-calculated — do not edit)* |
| F | `AmountReceived` | `£828.00` |
| G | `AmountExVAT` | `£690.00` |
| H | `CommissionAmount` | *(auto-calculated — do not edit)* |
| I | `CommissionPaidDate` | *(leave blank until paid)* |
| J | `PartnersInvoiceID` | *(leave blank until paid)* |
| K | `Internal Notes` | *(optional — staff only)* |

**Date format:** always DD/MM/YYYY.

The dashboard refreshes on every page load — changes appear immediately.

---

## Marking Commission as Paid

1. Open the partner's Google Sheet
2. Find the relevant invoice row
3. Enter the payment date in **column I (`CommissionPaidDate`)** — format: `DD/MM/YYYY`
4. Optionally enter the partner's invoice reference in **column J (`PartnersInvoiceID`)**

Status changes automatically from **Due for Payment** → **Paid** on the dashboard.

---

## Deploying to Production

### Standard deploy

```bash
ssh -p 2222 root@91.98.170.58
bash /var/www/sterlinx-partners/deploy.sh
```

The script:
1. Runs `git pull origin main` using the deploy SSH key
2. Restarts `sterlinx-server` via PM2
3. Prints a confirmation with timestamp

### If `deploy.sh` fails (git pull error)

```bash
ssh -T -i ~/.ssh/github_deploy git@github.com
# Should return: Hi ariful-commits! You've successfully authenticated...
```

---

## Deploying to Staging

Push to the `staging` branch — GitHub Pages deploys automatically:

```bash
git checkout staging
# make changes
git push origin staging
```

Staging site: `https://ariful-commits.github.io/sterlinx-partners/`
Staging login: `/test-partner` · password `staging123`

GitHub Actions workflow: `.github/workflows/pages.yml`

---

## Restarting Services

### Portal server

```bash
ssh -p 2222 root@91.98.170.58
pm2 restart sterlinx-server
pm2 logs sterlinx-server --lines 30
```

### Cloudflare tunnel

```bash
pm2 restart cloudflared-tunnel
```

### n8n

```bash
docker restart n8n
# or full stop/start:
docker stop n8n && docker start n8n
```

---

## Checking Server Health

### Quick status check

```bash
ssh -p 2222 root@91.98.170.58
pm2 list
```

Expected output — both processes should show `online`:
```
│ 2 │ cloudflared-tunnel │ fork │ Xh │ online │
│ 5 │ sterlinx-server    │ fork │ Xm │ online │
```

### View recent logs

```bash
pm2 logs sterlinx-server --lines 30
```

Error lines to look out for:
- `EADDRINUSE` — port 8080 already in use (clears after restart)
- `Could not load` — Google Sheets fetch failed
- `Upstream timeout` — Google Sheets took >10s to respond

### Test the app is responding

```bash
curl -s http://localhost:8080 | head -3
# Should return: <!DOCTYPE html>

curl -s "http://localhost:8080/push-vapid-key"
# Should return: {"publicKey":"BA6Ts..."}
```

---

## Accessing n8n

n8n is available at: `https://n8n.sterlinxglobal.com`

Login: `ariful@abis.co` (password set during setup — not stored here).

If you're locked out, reset the password on the server:

```bash
ssh -p 2222 root@91.98.170.58
docker exec -it n8n n8n user-management:reset
```

---

## Checking n8n Workflow Execution Logs

In the n8n UI:
1. Go to `https://n8n.sterlinxglobal.com`
2. Click on a workflow
3. Click **Executions** (top right) to see all past runs
4. Click any execution to see node-by-node input/output

Via API (staff use):
```bash
ssh -p 2222 root@91.98.170.58
curl -s -H "X-N8N-API-KEY: <key>" https://n8n.sterlinxglobal.com/api/v1/executions | head
```

The API key is stored in the n8n database (`user_api_keys` table, label "Claude Code Deploy").

---

## Zoho Webhook URLs

These are configured in Zoho Books and Zoho CRM under **Automation → Webhooks**:

| Event | Webhook URL |
|-------|------------|
| Invoice paid (Zoho Books) | `https://n8n.sterlinxglobal.com/webhook/zoho-invoice-paid` |
| New partner contact created (Zoho CRM) | `https://n8n.sterlinxglobal.com/webhook/zoho-partner-created` |

The Zoho OAuth credential in n8n (`Zoho OAuth`, id `7gSiNWgQLxn7Ac2i`) must be connected.
If it shows as disconnected, re-authorise it in n8n: **Credentials → Zoho OAuth → Reconnect**.

---

## Google Service Account

**Email**: `sterlinx-sheets-automation@sterlinx-partner-portal.iam.gserviceaccount.com`
**Project**: `sterlinx-partner-portal`
**Key file**: `sterlinx-partner-portal-ad303f1c15bd.json` (stored locally — do not commit to git)

Used for:
- n8n writing to partner Google Sheets (credential `Sterlinx Google SA`, id `DOsJmGy6243Mz0jB`)
- Local scripts (`setup_staging_sheets.js`) for staging sheet management

The service account must be shared (Editor) on any Google Sheet that n8n writes to.
To share: open the sheet → Share → paste the service account email → Editor.

---

## Postmark Email Setup

Postmark is configured in n8n as an `httpHeaderAuth` credential (`Postmark`, id `f2UnXydQY3S3CRMd`).
It uses the `X-Postmark-Server-Token` header.

Used by:
- **Workflow A** — sends commission notification email to partner after row is appended
- **Workflow B** — sends welcome email on new partner onboarding

From address used: `portal@sterlinxglobal.com`

To update the Postmark API key: n8n → Credentials → Postmark → edit the header value.

---

## Firewall (UFW)

```bash
ssh -p 2222 root@91.98.170.58
ufw status verbose
```

Current rules:
- Port `2222` allowed from one specific IP only
- Ports `80`/`443` allowed on `lo` (localhost) only
- Port `5678` allowed on `127.0.0.1` only (n8n Docker)
- Default: deny all incoming

### Updating the SSH whitelist when your IP changes

```bash
ssh -p 2222 root@91.98.170.58   # must do this BEFORE your IP changes
ufw delete allow 2222
ufw allow from <new-ip> to any port 2222
ufw status verbose               # confirm new rule
```

**Warning**: do this before your IP changes, or you will lock yourself out.

---

## Emergency Access via Hetzner Console

If SSH is inaccessible (IP locked out, UFW misconfigured):

1. Log in to [console.hetzner.com](https://console.hetzner.com)
2. Select the `sterlinx-ops` server
3. Click **Console** (browser-based terminal, bypasses SSH and UFW)
4. Log in as `root`
5. Fix UFW rules or SSH config

---

## Dashboard Features (Partner Guide)

### Filtering invoices

| Button | Shows |
|--------|-------|
| **All** | Every invoice logged |
| **Paid** | Commissions already paid to you |
| **Due** | Commissions overdue for payment |
| **Not Due** | Upcoming commissions not yet payable |

### Sorting columns

Click any underlined column header to sort:
- **First click** → ascending (↑)
- **Second click** → descending (↓)
- **Third click** → original order

### Pagination

10 rows per page. Page resets on filter/sort change.

### On mobile

Four columns visible: **Client**, **Invoice**, **Commission**, **Status**. Swipe horizontally if content is cut off.

### Installing as an app (PWA)

On Android/Chrome: browser menu → **Add to Home Screen**.
On iOS/Safari: Share button → **Add to Home Screen**.
On desktop Chrome: address bar install icon.

---

## Column Reference — Commission Sheet

Row 5 of each partner's sheet is the header row. Rows 1–4 are metadata (skipped by the portal).

| Col | Header | Notes |
|-----|--------|-------|
| A | `EntityName` | Client company name |
| B | `InvoiceID` | Must be non-empty for row to appear |
| C | `InvoiceDate` | DD/MM/YYYY |
| D | `InvoicePaymentDate` | DD/MM/YYYY — when client paid Sterlinx |
| E | `PaymentDueDate` | Auto-calculated: `=D+30` — do not edit |
| F | `AmountReceived` | Invoice amount received (£) |
| G | `AmountExVAT` | Invoice value ex VAT |
| H | `CommissionAmount` | Auto-calculated: `=G×rate%` — do not edit |
| I | `CommissionPaidDate` | Fill when paid — **triggers Paid status** |
| J | `PartnersInvoiceID` | Partner's invoice ref, shown on dashboard when Paid |
| K | `Internal Notes` | Staff-only — not shown on dashboard |

Any row where `EntityName` or `InvoiceID` is blank, or `EntityName` equals `TOTALS`, is excluded.

---

## Status Definitions

| Status | Shown when | Badge colour |
|--------|-----------|-------------|
| **Not Due** | `PaymentDueDate` is in the future (or blank) | Amber |
| **Due for Payment** | `PaymentDueDate` has passed and `CommissionPaidDate` is blank | Green |
| **Paid** | `CommissionPaidDate` has any date value | Blue |

---

## KPI Cards

| Card | Calculation |
|------|-------------|
| Total earned | Sum of `CommissionAmount` for all rows |
| Paid to you | Sum where status = Paid |
| Due for payment | Sum where status = Due for Payment |
| Not due yet | Sum where status = Not Due |

---

## Common Issues

| Symptom | Likely cause | Fix |
|---------|-------------|-----|
| Dashboard shows "Could not load commission data" | Sheet not published as CSV | File → Share → Publish to web in Google Sheets |
| All commissions show £0.00 | `skip` value wrong (0 instead of 4) | Check `fetchSheet(..., 4)` call in `index.html` |
| Partner not found | Slug in URL doesn't match `PartnerURL` column | Check case and spelling in config sheet |
| Password screen shows sign-out button | Older cached version | Hard refresh (Ctrl+Shift+R) |
| Site down (Cloudflare error) | `cloudflared-tunnel` crashed | `pm2 restart cloudflared-tunnel` |
| Deploy script fails | GitHub deploy key issue | Check `ssh -T -i ~/.ssh/github_deploy git@github.com` |
| n8n not reachable | Docker container stopped | `docker restart n8n` |
| Push notifications not arriving | No VAPID key or SW not registered | Check `/push-vapid-key` endpoint responds; check DevTools → Application → Service Workers |

---

## Contact & Escalation

| Need | Contact |
|------|---------|
| Add / remove a partner | Update the config Google Sheet (no code change needed) |
| Invoice data changes | Edit the partner's Google Sheet directly |
| Code change or bug fix | Claude Code — describe what needs to change |
| Server access issues | SSH key holder only — port 2222, IP-restricted |
| Emergency server access | Hetzner console (browser-based, no SSH needed) |
| Billing / infrastructure | Hetzner Cloud console + Cloudflare dashboard |
| n8n automation issues | n8n.sterlinxglobal.com → Executions log |
