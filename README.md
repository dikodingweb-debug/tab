# EverUS WebAuthn service

The browser never authenticates by itself: this service verifies the WebAuthn
challenge, origin, relying-party ID, user verification flag, and credential
signature. Apps Script continues to issue the normal 12-hour application
session after checking a short-lived, single-use HMAC ticket from this service.

## Deploy

1. Deploy this directory to a Node.js 20+ host with HTTPS and a persistent
   writable disk. The SQLite database must survive restarts; do not use an
   ephemeral filesystem in production.
2. Configure these environment variables on the host:
   - `GAS_API_URL`: the deployed Apps Script `/exec` URL.
   - `EXPECTED_ORIGIN`: the exact HTTPS origin serving the frontend, without a
     trailing slash (for example `https://savings.example.com`).
   - `RP_ID`: that frontend origin's hostname only (for example
     `savings.example.com`).
   - `PASSKEY_HMAC_SECRET`: a randomly generated secret of at least 32
     characters. Use the same value in Apps Script Script Properties.
   - Optional `PORT` (defaults to `3000`) and `DATABASE_PATH` (defaults to
     `./data/passkeys.sqlite`).
3. In Apps Script, add `passkey-bridge.gs` as a new script file, add its three
   `case` lines to `route_()`, and add Script Property
   `PASSKEY_HMAC_SECRET` with the exact same secret from step 2. Save, deploy a
   new Web App version, and update `API_URL` in `config.js` if the URL changes.
4. Set `WEBAUTHN_API_URL` in `config.js` to the service URL ending in `/api`,
   such as `https://passkey-api.example.com/api`.
5. Redeploy the frontend over HTTPS. `RP_ID` must match the frontend hostname;
   changing the hostname requires users to register their passkeys again.

The service exposes only the enrollment and authentication routes used by this
frontend. Keep the HMAC secret private, back up the persistent SQLite database,
and protect the Apps Script and hosting accounts with strong authentication.

## Run locally

From this directory, run `npm install` and then `npm start`. Set the required
environment variables first. WebAuthn works on `localhost` for local testing;
for any other hostname the page must use HTTPS.
