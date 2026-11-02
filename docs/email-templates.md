# SamEduHub email templates

SamEduHub emails use the platform’s existing visual language:

- Primary blue: `#155EEF`
- Navy: `#0C3275`
- Warm page background: `#FAF7F2`
- Body text: `#1A1D20`

The reusable HTML and plain-text templates live in [`cloudflare/emailTemplates.ts`](../cloudflare/emailTemplates.ts).

## Application emails sent through Resend

| Event | Recipient | Template |
| --- | --- | --- |
| Successful wallet funding | Customer | `walletFundingConfirmation` |
| Successful data, airtime, exam PIN, or electricity purchase | Customer | `purchaseConfirmation` |
| Successful funding or purchase | Admin | `adminActivityNotification` |
| New support complaint | Support/admin | `supportComplaintNotification` |
| Support complaint received | Customer | `supportComplaintAcknowledgement` |

The Worker keeps the Resend API key server-side and retries failed transaction/admin notifications through D1. The customer notification table prevents duplicate customer messages; the admin notification table prevents duplicate admin messages.

Required server configuration:

```text
RESEND_API_KEY=re_...
RESEND_FROM_EMAIL=SamEduHub <support@sameduhub.com>
RESEND_ADMIN_EMAIL=support@sameduhub.com
```

The sender domain must be verified in Resend before production delivery. The API key must be stored as a Worker secret, not in a `VITE_` variable or committed file.

## Authentication email copy

The current frontend uses Firebase’s `sendEmailVerification` and `sendPasswordResetEmail`, so Firebase still generates and sends those secure action-link emails. Firebase supports editing these templates in Authentication → Templates. The branded copy is also available in `cloudflare/emailTemplates.ts` as:

- `signupConfirmationTemplate(actionUrl)`
- `passwordResetTemplate(actionUrl)`

Those functions accept a generated action URL. To deliver authentication emails through Resend instead of Firebase, the server must generate Firebase Admin action links and then call Resend; the Resend key alone cannot safely generate Firebase verification or password-reset links.

Do not replace a Firebase action URL with a normal dashboard URL. Verification and password-reset links are one-time security links.
