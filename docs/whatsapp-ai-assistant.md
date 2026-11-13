# SamEduHub AI WhatsApp Assistant

The existing website WhatsApp contact links remain unchanged. The production assistant is an additional server-side integration that uses the official Meta WhatsApp Cloud API for messaging and Groq Chat Completions for drafting replies.

## Architecture

- `cloudflare/worker.ts` exposes the Meta webhook and admin-only assistant endpoints.
- `cloudflare/whatsapp.ts` sends text messages through Meta Graph API.
- `cloudflare/groq.ts` calls `https://api.groq.com/openai/v1/chat/completions` with a server-side key and configurable model.
- D1 migration `0009_whatsapp_ai_assistant.sql` stores conversations, messages, webhook idempotency keys, outbound retry jobs, and editable assistant settings.
- Existing Firebase ID-token verification and admin custom claims protect the admin endpoints.

Live AI replies are disabled unless both the Worker environment variable `WHATSAPP_AI_ENABLED=true` and the admin configuration toggle are enabled. Missing provider credentials keep the assistant disabled and do not affect existing purchases, wallet funding, support email, or authentication.

## Environment variables

Configure these as Cloudflare Worker variables/secrets. Never use a `VITE_` prefix.

| Variable | Type | Purpose |
| --- | --- | --- |
| `WHATSAPP_ACCESS_TOKEN` | secret | Meta WhatsApp Cloud API bearer token |
| `WHATSAPP_PHONE_NUMBER_ID` | variable | Meta WhatsApp business phone number ID |
| `WHATSAPP_BUSINESS_ACCOUNT_ID` | variable | Meta WhatsApp Business Account ID |
| `WHATSAPP_VERIFY_TOKEN` | secret | Random value entered in Meta webhook configuration |
| `WHATSAPP_APP_SECRET` | secret | Meta app secret used for `X-Hub-Signature-256` validation |
| `WHATSAPP_GRAPH_API_VERSION` | variable | Graph API version currently selected in Meta documentation/dashboard |
| `WHATSAPP_AI_ENABLED` | variable | Keep `false` until testing is complete; set `true` to allow AI replies |
| `WHATSAPP_REQUEST_TIMEOUT_MS` | variable | Meta request timeout, usually `15000` |
| `GROQ_API_KEY` | secret | Groq API key |
| `GROQ_MODEL` | variable | A currently supported Groq chat model ID |
| `GROQ_REQUEST_TIMEOUT_MS` | variable | Groq request timeout, usually `15000` |

The example files contain empty values for these settings. The model is intentionally not hardcoded because Groq model availability changes. Select a currently active model from Groq's model list and set `GROQ_MODEL`.

## Meta setup

1. Create or use a Meta developer app with WhatsApp Cloud API enabled.
2. Copy the phone number ID and WhatsApp Business Account ID into Worker variables.
3. Create a long-lived/system-user access token with the WhatsApp messaging permissions required by the Meta account and store it as `WHATSAPP_ACCESS_TOKEN`.
4. Set `WHATSAPP_VERIFY_TOKEN` to a random value known only to you.
5. Set `WHATSAPP_APP_SECRET` to the Meta app secret.
6. Set the webhook callback URL to `https://<your-worker-domain>/api/whatsapp/webhook`.
7. Subscribe the WhatsApp Business Account to the `messages` webhook field.
8. Verify the callback. The Worker answers Meta's `hub.challenge` only when the mode and verify token match.

Meta POST notifications are accepted only when the `X-Hub-Signature-256` HMAC matches the raw request body and app secret. Duplicate message IDs are ignored. Incoming messages are acknowledged before Groq and outbound delivery complete; processing continues with the Worker execution context.

## Groq setup

Create a Groq API key, store it as `GROQ_API_KEY`, choose an active chat model, and set `GROQ_MODEL`. The Worker sends a system instruction, a bounded recent conversation history, and the current customer message to the official chat-completions endpoint. The key is never returned to the browser or admin API.

## Admin controls

Authorized Firebase admin users see **AI WhatsApp Assistant** in the existing admin console. It provides:

- provider/configuration readiness and conversation metrics;
- searchable conversations and message history;
- AI, paused, and human takeover modes;
- human replies through Meta;
- editable verified services, prices, FAQs, hours, welcome copy, system instructions, and escalation instructions;
- a Groq connectivity test.

When a conversation is escalated, the conversation switches to human mode and AI replies stop. The Worker attempts to notify `BREVO_ADMIN_EMAIL`; it does not claim that an administrator was notified if Brevo delivery fails. AI resumes only after an administrator explicitly chooses **Resume AI**.

## Local testing

Apply the migration locally, configure `.dev.vars`, and run Wrangler:

```powershell
npx wrangler d1 migrations apply sameduhub --local --config .\wrangler.jsonc
npx wrangler dev --config .\wrangler.jsonc
```

Use Meta's test WhatsApp number. Verify the webhook with a GET request containing `hub.mode=subscribe`, `hub.verify_token`, and `hub.challenge`. For POST testing, generate the `sha256=` HMAC using the exact raw JSON body and `WHATSAPP_APP_SECRET`; do not send unsigned requests.

The admin API paths are:

- `GET /api/cloudflare/admin/whatsapp/status`
- `GET /api/cloudflare/admin/whatsapp/conversations`
- `GET /api/cloudflare/admin/whatsapp/conversations/:phone/messages`
- `PATCH /api/cloudflare/admin/whatsapp/conversations/:phone`
- `POST /api/cloudflare/admin/whatsapp/conversations/:phone/messages`
- `GET|PUT /api/cloudflare/admin/whatsapp/config`
- `POST /api/cloudflare/admin/whatsapp/test-groq`

Keep `WHATSAPP_AI_ENABLED=false` during initial verification. Confirm webhook signature validation, duplicate-event handling, Groq test, Meta test-number delivery, conversation separation, retry behavior, and human takeover before enabling live automation.

## Production deployment

Apply the remote D1 migration, add the Meta and Groq settings/secrets, deploy the Worker, and then enable the assistant only after a successful test:

```powershell
npx wrangler d1 migrations apply sameduhub --remote --config .\wrangler.jsonc
npx wrangler secret put WHATSAPP_ACCESS_TOKEN --config .\wrangler.jsonc
npx wrangler secret put WHATSAPP_VERIFY_TOKEN --config .\wrangler.jsonc
npx wrangler secret put WHATSAPP_APP_SECRET --config .\wrangler.jsonc
npx wrangler secret put GROQ_API_KEY --config .\wrangler.jsonc
npx wrangler deploy --config .\wrangler.jsonc
```

Set non-secret variables in the Worker configuration/dashboard, update `WHATSAPP_GRAPH_API_VERSION` and `GROQ_MODEL` from the current provider documentation, and leave `WHATSAPP_AI_ENABLED=false` until the admin test is complete. Existing payment and purchase credentials are not changed by this feature.
