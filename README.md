# Sterlinx Partner Portal — Setup Guide

## How it works

Two Google Sheets, that's it:

1. **Config sheet** — one row per partner (staff manage this)
2. **Partner sheet** — Anil's commission data (one per partner, already built)

Staff add a partner → dashboard goes live automatically. No code. No deployment.

---

## One-time setup (you do this once)

### 1. Create the config Google Sheet

Create a new Google Sheet. Name the first tab: `Partners`

Add these exact headers in row 1:

| PartnerName | PartnerURL | SheetURL | CommissionRate | SheetTab |
|---|---|---|---|---|
| Anil Demir | anil-demir | https://docs.google.com/spreadsheets/d/... | 20 | Commission_Log |

- **PartnerName** — how their name appears on the dashboard
- **PartnerURL** — the URL extension (no spaces, lowercase, hyphens only)
- **SheetURL** — paste the full URL of their commission Google Sheet
- **CommissionRate** — number only, e.g. `20`
- **SheetTab** — the tab name in their sheet (usually `Commission_Log`)

### 2. Publish the config sheet

File → Share → Publish to web → Partners tab → CSV → Publish

Copy the Sheet ID from the URL bar:
`https://docs.google.com/spreadsheets/d/` **THIS_PART** `/edit`

### 3. Paste the Sheet ID into index.html

Open `index.html`, find line near the top:
```
const CONFIG_SHEET_ID = 'YOUR_CONFIG_SHEET_ID_HERE';
```
Replace with your actual ID. Save.

### 4. Publish each partner's commission sheet

Each partner's Google Sheet also needs to be published:
File → Share → Publish to web → Commission_Log tab → CSV → Publish

### 5. Deploy to Cloudflare Pages

- Push this folder to a private GitHub repo
- Cloudflare Pages → Create project → Connect to Git → select repo
- Build command: leave blank
- Output directory: `/`
- Deploy

### 6. Set up the subdomain

Cloudflare Pages → Custom domains → `partners.sterlinx.co.uk`
(DNS adds automatically since you're already on Cloudflare)

### 7. Lock each partner's URL with Cloudflare Access

Zero Trust → Access → Applications → Add application → Self-hosted
- Domain: `partners.sterlinx.co.uk`
- Policy: path `/anil-demir/*` → email `anil@email.com`

Anil visits his URL → Cloudflare emails him a one-time code → he's in.

---

## Adding a new partner (staff do this going forward)

1. Import the partner's commission Excel into Google Sheets
2. Publish it (File → Share → Publish to web → Commission_Log → CSV)
3. Open the config sheet
4. Add one new row:

| Jane Smith | jane-smith | https://docs.google.com/... | 20 | Commission_Log |

5. Tell Cloudflare Access: add `jane@email.com` for path `/jane-smith/*`

`partners.sterlinx.co.uk/jane-smith` is now live. Done.

---

## Column name changes

If you rename a column in a partner's commission sheet, open `index.html`
and find the `D` object near the top — update the matching value there.

```js
const D = {
  entity:      'EntityName',          // ← change to match your column header
  invoiceId:   'InvoiceID',
  ...
};
```

---

## File structure

```
sterlinx-partners/
├── index.html      ← the entire portal (one file)
├── _redirects      ← Cloudflare routing (don't touch)
└── README.md       ← this file
```
