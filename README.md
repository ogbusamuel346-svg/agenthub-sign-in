# SamEduHub

SamEduHub is a React and Vite web app. Firebase Authentication remains the sign-in provider. Cloudflare Workers handles the deployed API, with D1 for Cloudflare wallet and transaction records.

## Local setup

1. Install packages with `npm install`.
2. Set the browser Firebase values in `.env.local` using `.env.example` as a guide.
3. Copy `.dev.vars.example` to `.dev.vars` and set the server-only values needed by Wrangler. Never put provider secrets in `VITE_` variables or commit `.dev.vars`.
4. `npm run dev` starts the local Express and Vite development server. This local compatibility server still uses Firebase Admin for its legacy API routes.

## Cloudflare preview

The preview Worker is configured in `wrangler.preview.jsonc` and uses the separate `sameduhub-preview` D1 database. `.env.preview` sets `VITE_CLOUDFLARE_API=true` so the preview app calls the Cloudflare API.

- `npm run cf:preview:build` builds the preview app.
- `npm run cf:preview:deploy` builds and deploys the preview Worker.
- `npm run cf:preview:migrate` applies the preview D1 migrations.

Preview wallet funding is enabled for Flutterwave verification. Keep test credentials in `.dev.vars` while testing; do not repeat the Firebase import into D1. TopupMate purchases stay disabled in preview because the configured TopupMate API is live; enable them only after the supplier account is funded and transaction status reconciliation is verified. Flutterwave sandbox mode does not sandbox TopupMate purchases.

## Production safety

`wrangler.jsonc` keeps wallet cutover, wallet funding, and supplier purchases disabled. Keep those flags disabled until the production data, balances, and transaction history have been reconciled. Preview settings do not change production settings.

## Migration tools

`npm run cf:migrate:plan` creates a read-only import plan from a Firebase Realtime Database export. `npm run cf:config:d1` updates the production D1 binding from a configured database ID. Review generated plans and confirm the target before applying any data changes.

Firebase Auth uses the web configuration in `.env.local`. Firebase CLI deployment and Realtime Database rules configuration were removed because the deployed backend is being moved to Cloudflare; this does not delete data or change settings in the Firebase account.
