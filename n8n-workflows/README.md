# Sterlinx n8n Workflows

Exported workflow JSON files for the Sterlinx Partner Portal automation.

## Workflows

| File | Description |
|------|-------------|
| invoice-commission.json | Zoho Billing paid invoice → partner Google Sheet row |
| partner-onboarding.json | New Zoho CRM partner contact → sheet + welcome email |

## Credentials required in n8n

| Credential | Type | Used by |
|---|---|---|
| Zoho OAuth | OAuth2 | Both workflows |
| Google Service Account | Service Account JSON | Both workflows |
| Postmark | HTTP Header Auth | partner-onboarding |

## Webhook URLs (production)

- Invoice webhook: https://n8n.sterlinxglobal.com/webhook/zoho-invoice-paid
- Onboarding webhook: https://n8n.sterlinxglobal.com/webhook/zoho-partner-created
