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
| Email verification completed | Customer | `signupWelcomeNotification` |
| New support complaint | Support/admin | `supportComplaintNotification` |
| Support complaint received | Customer | `supportComplaintAcknowledgement` |

The Worker uses Brevo SMTP for application notifications while Firebase continues to send authentication action emails. After Firebase reports a verified email in a fresh ID token, the Worker queues one branded welcome message in `signup_email_notifications`. That queue is keyed by Firebase UID, so the message is sent once and retried by the scheduled Worker if SMTP is temporarily unavailable. Transaction and admin notifications use their existing D1 idempotency tables.

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

Those action-link functions are not used for verification or password-reset delivery in the current app: Firebase sends those secure authentication messages. `signupWelcomeNotification` is separate and is sent through Brevo only after the server verifies that Firebase has marked the account email as verified. To replace Firebase authentication delivery in the future, the server would need to generate Firebase Admin action links and then call Brevo SMTP; an email credential alone cannot safely generate Firebase verification or password-reset links.

Do not replace a Firebase action URL with a normal dashboard URL. Verification and password-reset links are one-time security links.
