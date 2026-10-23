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

Preview wallet funding uses Paystack test credentials (`PAYSTACK_MODE=test`) and the separate `sameduhub-preview` D1 database. Preview credits are test data. The preview still points TopupMate reads at its live API for catalogues and reconciliation, but supplier purchases stay disabled. A server-side guard rejects every TopupMate purchase unless Paystack is in live mode with a matching live key, TopupMate is explicitly configured for live mode and the live API URL, the customer wallet cutover is enabled, and supplier purchases are enabled. Paystack test mode never makes a TopupMate purchase safe.

## Production safety

`wrangler.jsonc` currently enables the Cloudflare wallet cutover, Paystack funding, and TopupMate purchases. The single production wallet was reconciled against the provided Firebase export and has a zero balance; preview test credits remain in a separate D1 database. Fund the live TopupMate supplier wallet before placing any purchase, and disable supplier purchases if the supplier balance or transaction-status checks are unhealthy. Preview settings do not change production settings.

### Live payment and supplier setup

1. In the Cloudflare dashboard, select the **`sameduhub-api` production Worker**, then add this server-side secret under **Settings → Variables and Secrets**. Never add it to `VITE_` variables, Git, or chat:
   - `PAYSTACK_SECRET_KEY`: Paystack **Live** secret key (`sk_live_...`).
   - `TOPUPMATE_API_TOKEN`: the TopupMate **Live** API token.
   Also add `TOPUPMATE_API_BASE_URL` as a Worker variable with value `https://connect.topupmate.com/api/`.
2. Keep `wrangler.jsonc` set to `PAYSTACK_MODE: "live"` and `TOPUPMATE_MODE: "live"`. The Worker rejects test Paystack keys in production.
3. In Paystack's live dashboard, set the webhook URL to `https://sameduhub-api.<your-workers-domain>/api/cloudflare/paystack/webhook`. Paystack signs webhooks with the secret key, so no separate webhook hash is configured. The checkout callback is generated from the Worker URL.
4. Fund the TopupMate supplier wallet in the TopupMate dashboard. This is separate from funding a customer wallet through Paystack.
5. Before enabling production wallet cutover, reconcile production D1 wallets and pending transactions against Firebase. Do not copy preview/test wallet credits into production. The current single wallet was matched to the Firebase export; the confirmed sandbox funding attempts were marked failed without credit.
6. Production funding and purchases are enabled in `wrangler.jsonc`. Before placing a live order, fund the TopupMate supplier wallet and confirm transaction-status lookup. Disable `TOPUPMATE_PURCHASES_ENABLED` if supplier balance or status checks are unhealthy. A test-mode Paystack key cannot fund or unlock live supplier purchases.

Use `wrangler secret put <NAME> --config wrangler.jsonc` to add each production secret interactively. Preview deployments no longer upload `.dev.vars`; add preview-only credentials with `wrangler secret put <NAME> --config wrangler.preview.jsonc`. Keep test and live credentials in their matching Worker environments. Configure `TOPUPMATE_API_BASE_URL` as a Worker variable in each environment; it is not a secret.

Apply the new Paystack webhook-event table before deploying the Paystack Worker: run `wrangler d1 migrations apply sameduhub-preview --remote --config wrangler.preview.jsonc` for preview and `wrangler d1 migrations apply sameduhub --remote --config wrangler.jsonc` for production. Deploy and confirm preview funding before switching production. The prior Flutterwave webhook table remains as migration history so existing audit data is preserved; current application code no longer uses Flutterwave.

The production Vite build uses `.env.production` to route browser wallet and VTU requests to the Cloudflare Worker. `npm run cf:deploy` builds the production frontend with this setting before deploying `wrangler.jsonc`.

## Migration tools

`npm run cf:migrate:plan` creates a read-only import plan from a Firebase Realtime Database export. `npm run cf:config:d1` updates the production D1 binding from a configured database ID. Review generated plans and confirm the target before applying any data changes.

Firebase Auth uses the web configuration in `.env.local`. Firebase CLI deployment and Realtime Database rules configuration were removed because the deployed backend is being moved to Cloudflare; this does not delete data or change settings in the Firebase account.
