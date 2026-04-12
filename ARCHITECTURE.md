# Sterlinx Partner Portal — Architecture

## System Overview

A lightweight, single-page commission dashboard for Sterlinx Global affiliate partners.
Each partner has a private URL (e.g. `partners.sterlinxglobal.com/anil-demir`). They enter
a password, and the portal fetches their commission data live from a Google Sheet and renders
it as a read-only dashboard. No backend database — Google Sheets is the source of truth.

Built across three phases:
- **Phase 1** — Core portal (SPA, Google Sheets backend, password auth, commission dashboard)
- **Phase 2** — Zoho automation (n8n on Docker, invoice-paid → commission sheet, partner onboarding)
- **Phase 3** — PWA + push notifications (installable app, service worker, VAPID push)

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Runtime | Node.js v20 (LTS) |
| Process manager | PM2 |
| Reverse proxy / TLS | Cloudflare Tunnel (`cloudflared`) |
| Frontend | Vanilla JS, PapaParse (CDN), no framework |
| Data source | Google Sheets (published CSV) |
| Automation | n8n (Docker container `n8nio/n8n`, persisted via `n8n_data` volume) |
| Push notifications | `web-push` npm package (VAPID) |
| Email | Postmark (HTTP API via n8n `httpHeaderAuth` credential) |
| Hosting | Hetzner Cloud (CPX22) |
| OS | Ubuntu 24.04 |
| Repository | GitHub — `ariful-commits/sterlinx-partners` |
| Staging | GitHub Pages — `https://ariful-commits.github.io/sterlinx-partners/` |
| Production domain | `partners.sterlinxglobal.com` |
| n8n domain | `n8n.sterlinxglobal.com` |

---

## Server Details

| Property | Value |
|----------|-------|
| Provider | Hetzner Cloud |
| Plan | CPX22 — 2 vCPU (shared x86), 4 GB RAM, 80 GB SSD |
| Location | Nuremberg, Germany (`nbg1-dc3`) |
| IPv4 | `91.98.170.58` |
| OS | Ubuntu 24.04 LTS |
| SSH port | `2222` (restricted — see Security) |
| App port | `8080` (localhost only, not exposed) |
| n8n port | `5678` (Docker internal, proxied via nginx on `127.0.0.1:5679`) |

---

## File Structure

### On the server — `/var/www/sterlinx-partners/`

```
index.html                  Single-page application — all UI, logic, and CSS in one file
server.js                   Node.js HTTP server — serves index.html, proxies Google Sheets CSV, handles push endpoints
deploy.sh                   Deployment script — git pull + pm2 restart
manifest.json               PWA web app manifest (name, icons, display:standalone, theme_color)
service-worker.js           PWA service worker — shell caching + push notification handler
icons/
  icon-192.png              PWA icon 192×192 (navy #0f1f3d)
  icon-512.png              PWA icon 512×512 (navy #0f1f3d)
push-subscriptions.json     Runtime file — push subscription store per partner slug (auto-created)
node_modules/web-push/      VAPID push library
robots.txt                  Blocks all search engine indexing
```

### In the GitHub repository — `ariful-commits/sterlinx-partners`

Same files, tracked in `main` branch. The server pulls from here on deployment.

Additional files in repo (not deployed):
```
n8n-workflows/
  invoice-commission.json   Exported n8n Workflow A JSON
  partner-onboarding.json   Exported n8n Workflow B JSON
  README.md                 Workflow documentation
ARCHITECTURE.md             This file
RUNBOOK.md                  Operational runbook
sterlinx-partner-portal-ad303f1c15bd.json  Google Service Account key (local only, not committed)
```

### Branches

| Branch | Purpose | Deployed to |
|--------|---------|-------------|
| `main` | Production code | Hetzner server via `deploy.sh` |
| `staging` | Testing with staging sheets | GitHub Pages (automatic on push) |

### Key sections inside `index.html`

| Section | Description |
|---------|-------------|
| `CONFIG_SHEET_ID` / `CONFIG_CSV_DIRECT` | Published CSV URL for the master config sheet |
| `const C = {...}` | Column name mapping for the config sheet |
| `const D = {...}` | Column name mapping for each partner's commission sheet |
| `fetchSheet()` | Fetches a sheet via the server-side proxy, parses CSV with PapaParse |
| `getStatus(row)` | Derives commission status from dates (see Status Logic below) |
| `renderDashboard()` | Builds KPI cards, filter bar, invoice table, client breakdown |
| `makeRows()` | Renders an array of data rows to HTML table rows |
| `setupTable()` | Handles filter buttons, sortable column headers, and pagination |
| `subscribeToPush(slug)` | Requests push permission after auth, registers subscription with `/push-subscribe` |
| `boot()` | Entry point — loads config, finds partner, checks password, loads data |

---

## Frontend Features

| Feature | Detail |
|---------|--------|
| **Status filter bar** | Four buttons — All, Paid, Due, Not Due — filter the invoice table in-place |
| **Sortable columns** | Client, Invoice, Invoice date, Payment date, Ex VAT, Commission, Due date, Status. Click once = ascending (↑), again = descending (↓), third click = reset. Dates sorted chronologically; currency numerically. |
| **Pagination** | 10 rows per page. Controls appear only when filter result exceeds 10 rows. Resets to page 1 on sort/filter change. |
| **Mobile responsive** | ≤768px: sidebar hidden, five columns hidden. Four columns visible (Client, Invoice, Commission, Status). Horizontal scroll fallback. |
| **Password protection** | Password checked client-side against config sheet value. Stored in `sessionStorage` — cleared on tab close. |
| **PWA / installable** | `manifest.json` + `service-worker.js` make the portal installable as a home-screen app on Android/iOS/desktop. |
| **Push notifications** | After auth, browser subscribes via VAPID. Subscription stored per slug on server. n8n triggers push on new commission. |

---

## Data Flow

### Page load and authentication

```
Browser                     Server (port 8080)              Google Sheets
  │                               │                               │
  │  GET /anil-demir              │                               │
  │ ─────────────────────────────>│                               │
  │  ← index.html + SW registered │                               │
  │                               │                               │
  │  GET /sheet-proxy?url=        │                               │
  │  [config sheet CSV URL]       │  https.get(config sheet URL)  │
  │ ─────────────────────────────>│ ─────────────────────────────>│
  │  ← CSV (2-min cache)          │                               │
  │                               │                               │
  │  [PapaParse → find partner,   │                               │
  │   check password]             │                               │
  │                               │                               │
  │  GET /sheet-proxy?url=        │  https.get(partner sheet URL) │
  │  [partner commission CSV]     │ ─────────────────────────────>│
  │  ← CSV (skip 4 metadata rows) │                               │
  │                               │                               │
  │  [renderDashboard()]          │                               │
  │                               │                               │
  │  POST /push-subscribe         │  store subscription           │
  │  {slug, subscription}         │  → push-subscriptions.json    │
```

### Zoho invoice paid → commission sheet (n8n Workflow A)

11-node chain. Includes exclusion filter before any commission row is written.

```
Zoho Books                  n8n (port 5678 → nginx 5679)       Zoho / Sheets / Server
  │                               │                               │
  │  POST /webhook/               │                               │
  │  zoho-invoice-paid            │                               │
  │ ─────────────────────────────>│                               │
  │                               │  GET /books/v3/invoices/{id} │
  │                               │ ─────────────────────>Zoho Books
  │                               │  ← full invoice with line items
  │                               │                               │
  │                               │  Check Exclusion List (Code) │
  │                               │  scan line item NAMES for:   │
  │                               │  · confirmation statement    │
  │                               │  · government fee            │
  │                               │  · state fee                 │
  │                               │  · irs fee                   │
  │                               │  skip=true → STOP            │
  │                               │  skip=false → continue       │
  │                               │                               │
  │                               │  GET /crm/v3/Accounts/{id}   │
  │                               │ ─────────────────────>Zoho CRM│
  │                               │  ← account + Partners field  │
  │                               │                               │
  │                               │  IF Partners field non-empty │
  │                               │  fetch config sheet CSV      │
  │                               │ ─────────────────────────────>│
  │                               │  parse → find partner row    │
  │                               │  append commission row       │
  │                               │ ─────────────────────────────>│
  │                               │                               │
  │                               │  POST /push-notify           │
  │                               │ ──>server:8080               │
  │                               │  ← push sent to partner      │
  │                               │                               │
  │                               │  POST Postmark API           │
  │                               │  email to partner            │
```

#### Commission exclusion logic

The `Check Exclusion List` Code node scans **line item names only** (not descriptions or notes).
`EXCLUDED_KEYWORDS` array at the top of the node:

```javascript
const EXCLUDED_KEYWORDS = [
  'confirmation statement',
  'government fee',
  'state fee',
  'irs fee'
];
```

If any line item name contains one of these keywords (case-insensitive), `skip: true` is returned
and the `Skip Check` IF node halts execution — no commission row is written.

### New Zoho partner → sheet + welcome email (n8n Workflow B)

8-node chain. Includes `Contact_Type` guard before any sheet or email is created.

```
Zoho CRM                    n8n                            Zoho CRM / Sheets / Postmark
  │                               │                               │
  │  POST /webhook/               │                               │
  │  zoho-partner-created         │                               │
  │ ─────────────────────────────>│                               │
  │                               │  GET /crm/v3/Contacts/{id}   │
  │                               │ ─────────────────────>Zoho CRM│
  │                               │  ← full contact record       │
  │                               │                               │
  │                               │  IF Contact_Type === Partner │
  │                               │  ≠ Partner → STOP            │
  │                               │  = Partner → continue        │
  │                               │                               │
  │                               │  create commission sheet     │
  │                               │ ─────────────────────────────>│
  │                               │  add column headers          │
  │                               │  update config sheet row     │
  │                               │ ─────────────────────────────>│
  │                               │  POST Postmark welcome email │
  │                               │ ─────────────────────────────>│
```

---

## Zoho CRM Field Setup

Two custom fields power the automation chain:

### Contact module — `Contact Type` (picklist)

- **Values**: `Client`, `Partner`
- **Default**: `Client`
- Used by Workflow B to guard against creating portal accounts for non-partner contacts
- Set to `Partner` when creating a new affiliate partner in Zoho CRM

### Account module — `Partners` (single line text)

- Stores the **CRM Contact ID** of the assigned partner for that client account
- Used by Workflow A to look up which partner should receive the commission
- Find the Contact ID from the partner's Zoho CRM contact URL
- One account can have one assigned partner (single value field)

### How the two fields work together

```
New partner contact (Contact_Type=Partner)
         │
         ▼ Workflow B fires
  Creates Google Sheet + config row + sends welcome email
         │
         ▼ Staff action
  Open each client Account in Zoho CRM
  Paste partner's Contact ID into Partners field
         │
         ▼ On next paid invoice for that account
  Workflow A fires → exclusion check → commission row written
```

---

## Partner Setup Process (Two Steps)

### Step 1 — Create the partner in Zoho CRM

1. Zoho CRM → Contacts → **New Contact**
2. Fill in: Full Name, Email address
3. Set **Contact Type = Partner**
4. Save

n8n Workflow B fires automatically:
- Creates the partner's Google Sheet
- Adds their row to the production config sheet
- Sends them a welcome email with their portal URL and password

### Step 2 — Link the partner to their client accounts

For each client account this partner manages:
1. Open the client **Account** record in Zoho CRM
2. Find the partner's **Contact ID** (visible in the partner's contact URL)
3. Paste it into the **Partners** field on the Account record
4. Save

From this point, any paid invoice on that account triggers Workflow A and writes a commission row.

### Proxy caching

`server.js` caches each upstream Google Sheets response in memory for **2 minutes**.
A **10-second timeout** is enforced on all upstream requests.

---

## PWA and Push Notifications

### Service Worker (`service-worker.js`)

- **Cache name**: `sterlinx-v1`
- **Shell cache**: caches `/` and `/index.html` on install for offline support
- **Push handler**: receives push payloads `{title, body, url}`, shows browser notification with icon
- **Notification click**: focuses existing window or opens `data.url`
- **BASE path**: derived from `self.location.pathname` at runtime — works at root (production) and subdirectory (GitHub Pages staging)

### VAPID Keys (production)

- **Public key**: `BA6TsVJ1abNci43WcY_hcnWiAgqVDJQqSaXEpkPV-HBSL4nx1lck2XBfoOyDurp9DrrWG21jz7whfQYQklrgqSE`
- Private key stored in `server.js` on the server (not in git)

### Push Endpoints (`server.js`)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/push-vapid-key` | GET | Returns `{"publicKey":"..."}` for browser subscription setup |
| `/push-subscribe` | POST | Stores `{slug, subscription}` to `push-subscriptions.json`, deduped by endpoint URL |
| `/push-notify` | POST | Sends push to all subscribers for `slug`; auto-removes 410 Gone subscriptions |

---

## Security Setup

### UFW Firewall

| Port | Rule | Reason |
|------|------|--------|
| `22/tcp` | DENY (all) | Old SSH port, explicitly blocked |
| `2222` | ALLOW from `2.100.210.192` only | SSH restricted to known IP |
| `80` on `lo` | Localhost only | Not exposed to internet |
| `443` on `lo` | Localhost only | Not exposed to internet |
| `5678` on `127.0.0.1` | Localhost only | n8n Docker internal port |

Default policy: **deny incoming**, allow outgoing.

### Cloudflare Tunnel

All public HTTPS traffic flows through a Cloudflare Tunnel (`cloudflared`), managed by PM2.
Tunnel ID: `309c1966-4023-48d5-9c61-bf2c6902b0d5`

| Hostname | Routes to |
|----------|-----------|
| `partners.sterlinxglobal.com` | `http://localhost:8080` |
| `n8n.sterlinxglobal.com` | `http://localhost:5679` (nginx proxy in front of n8n Docker) |

Cloudflare DNS record for `partners`: `CNAME → 309c1966-...cfargotunnel.com` (proxied).

### nginx (n8n proxy)

Thin nginx server on `127.0.0.1:5679` proxies to n8n Docker on `127.0.0.1:5678`.
Adds `X-Robots-Tag: noindex, nofollow` to all n8n responses.
Serves a `/robots.txt` with `Disallow: /` for n8n subdomain.

### SSH

- Port `2222`, key-based auth only
- Restricted to a single IP via UFW
- Deploy key `~/.ssh/github_deploy` used exclusively for `git pull` in `deploy.sh`

### Application-level security

- Each partner's dashboard is password-protected
- Passwords stored in the config Google Sheet (staff-only access)
- Passwords checked client-side; stored in `sessionStorage` (cleared on tab close)
- No cookies, no server-side sessions, no personal data stored on the server
- Push subscriptions stored in `push-subscriptions.json` (server-local, not in git)

---

## Deployment Workflow

### Production (main → server)

```
1. Edit files locally (VS Code)
         │
         ▼
2. git push origin main
   → ariful-commits/sterlinx-partners (GitHub)
         │
         ▼
3. SSH into server (port 2222)
   run: /var/www/sterlinx-partners/deploy.sh
         │
         ├── GIT_SSH_COMMAND='ssh -i ~/.ssh/github_deploy' git pull origin main
         ├── pm2 restart sterlinx-server
         └── echo "Deployed at $(date)"
```

### Staging (staging → GitHub Pages)

```
1. Edit files locally on staging branch
         │
         ▼
2. git push origin staging
   → GitHub Pages auto-deploys via .github/workflows/pages.yml
   → https://ariful-commits.github.io/sterlinx-partners/
```

Staging uses:
- Staging config sheet CSV (`2PACX-1vQBjSjoJK...`)
- `window.location.hash` routing (GitHub Pages subdirectory compatibility)
- Staging banner (`position:fixed`, amber bar at top)
- `./manifest.json` and `./service-worker.js` (relative paths for subdirectory)

---

## Google Sheets Structure

### Production Config Sheet

Published CSV URL: `https://docs.google.com/spreadsheets/d/e/2PACX-1vTuxFpKKo.../pub?gid=0&single=true&output=csv`

| Column | Key (`C.`) | Description |
|--------|-----------|-------------|
| `PartnerName` | `name` | Display name shown in sidebar and page title |
| `PartnerURL` | `slug` | URL slug, e.g. `anil-demir` |
| `SheetURL` | `url` | Published CSV URL of the partner's commission sheet |
| `CommissionRate` | `rate` | Commission % shown in the rate pill (default 20) |
| `SheetTab` | `tab` | Tab name (informational; URL already encodes `gid=`) |
| `Password` | `password` | Access password for this partner's dashboard |
| `CRMContactID` | — | Zoho CRM contact ID — used by n8n to match webhook payload to partner |

### Staging Config Sheet

Published CSV URL: `https://docs.google.com/spreadsheets/d/e/2PACX-1vQBjSjoJK.../pub?gid=614516397&single=true&output=csv`

Contains one row: Test Partner / `test-partner` / password `staging123`

### Partner Commission Sheet

The first **4 rows** are metadata (partner name, CRM link, rate, payment terms) and are
skipped by `fetchSheet(..., 4)`. Row 5 is the header row.

| Column | Key (`D.`) | Description |
|--------|-----------|-------------|
| `EntityName` | `entity` | Client / company name |
| `InvoiceID` | `invoiceId` | Invoice reference number |
| `InvoiceDate` | `invoiceDate` | Date invoice was raised (DD/MM/YYYY) |
| `InvoicePaymentDate` | `payDate` | Date client paid the invoice (DD/MM/YYYY) |
| `PaymentDueDate` | `commDueDate` | Auto-calculated: `=D+30` — 30 days after client payment |
| `AmountReceived` | — | Invoice amount received (£) |
| `AmountExVAT` | `amtExVAT` | Invoice amount excluding VAT (£) |
| `CommissionAmount` | `commAmt` | Auto-calculated: `=G×rate%` |
| `CommissionPaidDate` | `commPaidDate` | Date commission was paid to partner (DD/MM/YYYY) |
| `PartnersInvoiceID` | `partnerRef` | Partner's own invoice reference (shown when Paid) |
| `Internal Notes` | — | Staff-only notes, not shown on dashboard |

### Test Commission Sheet (staging)

Spreadsheet ID: `1oNZwt_KnVSiTMFy9ya25r5A4C01p11VJjCbbJMUKL04`
Tab name: `Test Partner Commission — STAGING` (sheetId: `1183970835`)
Published CSV: `https://docs.google.com/spreadsheets/d/e/2PACX-1vTyDxvV0XX.../pub?gid=1183970835&single=true&output=csv`

Contains 5 rows covering all three statuses: Paid ×2, Due for Payment ×1, Not Due ×2.

---

## Status Logic

```
getStatus(row):
  if CommissionPaidDate has any value
    → "Paid"
  else if PaymentDueDate is a valid date AND today >= PaymentDueDate
    → "Due for Payment"
  else
    → "Not Due"
```

| Status | Badge colour | Meaning |
|--------|-------------|---------|
| Not Due | Amber | PaymentDueDate is in the future (or blank) |
| Due for Payment | Green | PaymentDueDate has passed, CommissionPaidDate is blank |
| Paid | Blue/navy | CommissionPaidDate column has a date |

---

## PM2 Processes

| ID | Name | Description |
|----|------|-------------|
| 2 | `cloudflared-tunnel` | Cloudflare Tunnel daemon — routes public HTTPS to localhost |
| 5 | `sterlinx-server` | Node.js app on port 8080 |

## n8n

- Runs as Docker container `n8n` using image `n8nio/n8n`
- Data persisted in Docker volume `n8n_data` (survives container restarts)
- Environment: `N8N_HOST=n8n.sterlinxglobal.com`, `WEBHOOK_URL=https://n8n.sterlinxglobal.com/`
- Admin login: `ariful@abis.co`
- Two active workflows — see `n8n-workflows/README.md`
