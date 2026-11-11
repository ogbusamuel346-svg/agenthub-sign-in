# SamEduHub email templates

SamEduHub emails use the platform’s existing visual language:

- Primary blue: `#155EEF`
- Navy: `#0C3275`
- Warm page background: `#FAF7F2`
- Body text: `#1A1D20`

The reusable HTML and plain-text templates live in [`cloudflare/emailTemplates.ts`](../cloudflare/emailTemplates.ts).

## Application emails sent through Brevo

| Event | Recipient | Template |
| --- | --- | --- |
| Successful wallet funding | Customer | `walletFundingConfirmation` |
| Successful data, airtime, exam PIN, or electricity purchase | Customer | `purchaseConfirmation` |
| Successful funding or purchase | Admin | `adminActivityNotification` |
| New support complaint | Support/admin | `supportComplaintNotification` |
| Support complaint received | Customer | `supportComplaintAcknowledgement` |

The Worker uses Brevo SMTP for all application emails except Firebase authentication emails. It connects to `smtp-relay.brevo.com` on port `587`, upgrades the connection with STARTTLS, authenticates with the Brevo SMTP username and SMTP key/password, and sends the branded HTML/plain-text message. The SMTP password is server-side, and failed transaction/admin notifications are retried through D1. The customer notification table prevents duplicate customer messages; the admin notification table prevents duplicate admin messages.

Required server configuration:

```text
BREVO_SMTP_HOST=smtp-relay.brevo.com
BREVO_SMTP_PORT=587
BREVO_SMTP_USERNAME=c011be001@smtp-brevo.com
BREVO_SMTP_PASSWORD=your_brevo_smtp_key
BREVO_FROM_EMAIL=ogbu8372@gmail.com
BREVO_FROM_NAME=SamEduHub
BREVO_ADMIN_EMAIL=ogbu8372@gmail.com
```

The sender email/domain must be verified in Brevo before delivery. Store `BREVO_SMTP_PASSWORD` as a Worker secret, not in a `VITE_` variable or committed file. Brevo documents that SMTP relay uses `smtp-relay.brevo.com`, port `587` or `2525` for non-encrypted connection upgrade, and an SMTP key/password rather than an API key.

Set the production secret interactively:

```text
npx wrangler secret put BREVO_SMTP_PASSWORD --config wrangler.jsonc
```

For the preview Worker, use:

```text
npx wrangler secret put BREVO_SMTP_PASSWORD --config wrangler.preview.jsonc
```

## Authentication email copy

The current frontend uses Firebase’s `sendEmailVerification` and `sendPasswordResetEmail`, so Firebase still generates and sends those secure action-link emails. Firebase supports editing these templates in Authentication → Templates. The branded copy is also available in `cloudflare/emailTemplates.ts` as:

- `signupConfirmationTemplate(actionUrl)`
- `passwordResetTemplate(actionUrl)`

Those functions accept a generated action URL. They are not used for signup or password-reset delivery in the current app: Firebase sends those authentication messages. To replace Firebase authentication delivery in the future, the server would need to generate Firebase Admin action links and then call Brevo SMTP; an email credential alone cannot safely generate Firebase verification or password-reset links.

Do not replace a Firebase action URL with a normal dashboard URL. Verification and password-reset links are one-time security links.
