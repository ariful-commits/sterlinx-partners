# Sterlinx Partner Portal — Architecture

## System Overview

A lightweight, single-page commission dashboard for Sterlinx Global affiliate partners.
Each partner has a private URL (e.g. `partners.sterlinxglobal.com/anil-demir`). They enter
a password, and the portal fetches their commission data live from a Google Sheet and renders
it as a read-only dashboard. No backend database — Google Sheets is the source of truth.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Runtime | Node.js v20 (LTS) |
| Process manager | PM2 |
| Reverse proxy / TLS | Cloudflare Tunnel (`cloudflared`) |
| Frontend | Vanilla JS, PapaParse (CDN), no framework |
| Data source | Google Sheets (published CSV) |
| Hosting | Hetzner Cloud (CPX22) |
| OS | Ubuntu 24.04 |
| Repository | GitHub — `ariful-commits/sterlinx-partners` |
| Public domain | `partners.sterlinxglobal.com` |

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

---

## File Structure

### On the server — `/var/www/sterlinx-partners/`

```
index.html       Single-page application — all UI, logic, and CSS in one file
server.js        Node.js HTTP server — serves index.html and proxies Google Sheets CSV
deploy.sh        Deployment script — git pull + pm2 restart
_redirects       Cloudflare Pages redirect rules (legacy, not used in current setup)
README.md        Brief project notes
```

### In the GitHub repository — `ariful-commits/sterlinx-partners`

Same files, tracked in `main` branch. The server pulls from here on deployment.

### Key sections inside `index.html`

| Section | Description |
|---------|-------------|
| `CONFIG_SHEET_ID` / `CONFIG_CSV_DIRECT` | Published CSV URL for the master config sheet |
| `const C = {...}` | Column name mapping for the config sheet |
| `const D = {...}` | Column name mapping for each partner's commission sheet |
| `fetchSheet()` | Fetches a sheet via the server-side proxy, parses CSV with PapaParse |
| `getStatus(row)` | Derives commission status from dates (see Status Logic below) |
| `renderDashboard()` | Builds KPI cards, filter bar, invoice table, client breakdown |
| `makeRows()` | Renders an array of data rows to HTML table rows (top-level, shared by initial render and sort/filter re-renders) |
| `setupTable()` | Handles filter buttons, sortable column headers, and pagination |
| `showLanding()` | Landing page shown when visiting root URL with no partner slug |
| `showSignout()` | Shows/hides the sign-out button |
| `boot()` | Entry point — loads config, finds partner, checks password, loads data |

---

## Frontend Features

| Feature | Detail |
|---------|--------|
| **Status filter bar** | Four buttons — All, Paid, Due, Not Due — filter the invoice table in-place. Internal status values (`Due for Payment`) are unaffected by the display label. |
| **Sortable columns** | Client, Invoice, Invoice date, Payment date, Ex VAT, Commission, Due date, Status columns are sortable. Click once = ascending (↑), again = descending (↓), third click = reset to original order. Sort persists across filter changes. Dates are sorted chronologically; currency columns sort numerically. |
| **Pagination** | 10 rows per page. Pagination controls appear only when the current filter result exceeds 10 rows. Page resets to 1 on any sort or filter change. |
| **Mobile responsive table** | On screens ≤768px, five columns are hidden (Invoice date, Payment date, Ex VAT, Due date, Partner ref). The four visible columns (Client, Invoice, Commission, Status) use fixed widths (35/20/20/25%). A horizontal scroll wrapper provides fallback if content overflows. |
| **Password protection** | Each partner's dashboard requires a password (stored in the config sheet). Password is checked client-side and stored in `sessionStorage` — cleared automatically when the tab closes. |

---

## Data Flow

```
Browser                     Server (port 8080)              Google Sheets
  │                               │                               │
  │  GET /anil-demir              │                               │
  │ ─────────────────────────────>│                               │
  │  ← index.html                 │                               │
  │                               │                               │
  │  [JS: boot() runs]            │                               │
  │                               │                               │
  │  GET /sheet-proxy?url=        │                               │
  │  [config sheet CSV URL]       │                               │
  │ ─────────────────────────────>│  https.get(config sheet URL)  │
  │                               │ ─────────────────────────────>│
  │                               │  ← CSV (2-min cache)          │
  │  ← CSV text                   │                               │
  │                               │                               │
  │  [PapaParse → find partner,   │                               │
  │   check password]             │                               │
  │                               │                               │
  │  GET /sheet-proxy?url=        │                               │
  │  [partner commission CSV URL] │                               │
  │ ─────────────────────────────>│  https.get(partner sheet URL) │
  │                               │ ─────────────────────────────>│
  │                               │  ← CSV (2-min cache)          │
  │  ← CSV text (skip 4 header    │                               │
  │    metadata rows)             │                               │
  │                               │                               │
  │  [PapaParse → renderDashboard]│                               │
```

### Proxy caching

`server.js` caches each upstream Google Sheets response in memory for **2 minutes**.
This means the second fetch (commission data after password entry) is near-instant on repeat loads.
A **10-second timeout** is enforced on all upstream requests — if Google doesn't respond, the server
returns HTTP 504 and the UI shows an error rather than spinning forever.

---

## Security Setup

### UFW Firewall

| Port | Rule | Reason |
|------|------|--------|
| `22/tcp` | DENY (all) | Old SSH port, explicitly blocked |
| `2222` | ALLOW from `2.100.210.192` only | SSH restricted to known IP |
| `80` on `lo` | Localhost only | Not exposed to internet |
| `443` on `lo` | Localhost only | Not exposed to internet |
| `5678` on `127.0.0.1` | Localhost only | n8n automation tool |

Default policy: **deny incoming**, allow outgoing.

### Cloudflare Tunnel

All public HTTPS traffic flows through a Cloudflare Tunnel (`cloudflared`), managed by PM2.
There is no Nginx or direct port 443 exposure. Cloudflare handles:
- TLS termination
- DDoS protection
- The `partners.sterlinxglobal.com` domain routing

The tunnel forwards to `http://localhost:8080` (the Node.js app).

### SSH

- Port `2222`, key-based auth only
- Restricted to a single IP via UFW
- Deploy key `~/.ssh/github_deploy` used exclusively for `git pull` in `deploy.sh`

### Application-level security

- Each partner's dashboard is password-protected
- Passwords stored in the config Google Sheet (staff-only access)
- Passwords checked client-side; stored in `sessionStorage` (cleared on tab close)
- No cookies, no server-side sessions, no personal data stored on the server

---

## Deployment Workflow

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
         ├── git pull origin main  (using ~/.ssh/github_deploy)
         ├── pm2 restart sterlinx-server
         └── echo "Deployed at $(date)"
```

`deploy.sh` content:
```bash
#!/bin/bash
cd /var/www/sterlinx-partners
GIT_SSH_COMMAND='ssh -i ~/.ssh/github_deploy' git pull origin main
pm2 restart sterlinx-server
echo "Deployed at $(date)"
```

---

## Google Sheets Structure

### Config Sheet (master partner list)

One row per partner. Published as CSV and referenced via `CONFIG_CSV_DIRECT` in `index.html`.

| Column | Key (`C.`) | Description |
|--------|-----------|-------------|
| `PartnerName` | `name` | Display name shown in sidebar and page title |
| `PartnerURL` | `slug` | URL slug, e.g. `anil-demir` |
| `SheetURL` | `url` | Published CSV URL of the partner's commission sheet |
| `CommissionRate` | `rate` | Commission % shown in the rate pill (default 20) |
| `SheetTab` | `tab` | Tab name (informational; URL already encodes `gid=`) |
| `Password` | `password` | Access password for this partner's dashboard |

### Partner Commission Sheet

The first **4 rows** are metadata (partner name, CRM link, rate, payment terms) and are
skipped by `fetchSheet(..., 4)`. Row 5 is the header row.

| Column | Key (`D.`) | Description |
|--------|-----------|-------------|
| `EntityName` | `entity` | Client / company name |
| `InvoiceID` | `invoiceId` | Invoice reference number |
| `InvoiceDate` | `invoiceDate` | Date invoice was raised (DD/MM/YYYY) |
| `InvoicePaymentDate` | `payDate` | Date client paid the invoice (DD/MM/YYYY) — entered manually |
| `PaymentDueDate` | `commDueDate` | Auto-calculated: `=D+30` — 30 days after client payment |
| `AmountReceived` | — | Invoice amount received (£) |
| `AmountExVAT` | `amtExVAT` | Invoice amount excluding VAT (£) |
| `CommissionAmount` | `commAmt` | Auto-calculated: `=G×20%` — commission due to partner (£) |
| `CommissionPaidDate` | `commPaidDate` | Date commission was paid to partner (DD/MM/YYYY) — entered manually |
| `PartnersInvoiceID` | `partnerRef` | Partner's own invoice reference (shown when Paid) |
| `Internal Notes` | — | Staff-only notes, not shown on dashboard |

---

## Status Logic

Commission status is derived entirely from dates — there is no manual status column.

```
getStatus(row):
  if CommissionPaidDate has any value
    → "Paid"
  else if PaymentDueDate is a valid date AND today >= PaymentDueDate
    → "Due for Payment"
  else
    → "Not Due"
```

`PaymentDueDate` (column E) is auto-calculated in the sheet as `=D+30` (30 days after the
client payment date). `CommissionDueDate` no longer exists as a column.

Dates are parsed as DD/MM/YYYY (Google Sheets default UK format).

| Status | Badge colour | Meaning |
|--------|-------------|---------|
| Not Due | Amber | PaymentDueDate is in the future (or blank) |
| Due for Payment | Green | PaymentDueDate has passed, CommissionPaidDate is blank |
| Paid | Blue/navy | CommissionPaidDate column has a date |

---

## PM2 Processes

| ID | Name | Description |
|----|------|-------------|
| 2 | `cloudflared-tunnel` | Cloudflare Tunnel daemon — public HTTPS routing |
| 5 | `sterlinx-server` | Node.js app on port 8080 |
