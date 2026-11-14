# Potential Millionaires ER:LC API (GitHub + Cloudflare Worker)

The dashboard page is served by GitHub Pages. This Worker is the private API backend for Discord sign-in, live Discord role checks, moderator join-code approval, and ER:LC requests. GitHub Pages cannot run server code or protect secrets by itself.

## Deploy the backend

1. Create a Cloudflare account and install Node.js on the computer used for deployment.
2. In a terminal, enter this repository's `worker` folder and run `npx wrangler@latest login`.
3. Create the D1 database with `npx wrangler@latest d1 create potential-millionaires-erlc`. Copy the returned database ID into `database_id` in `wrangler.toml`.
4. Apply the schema with `npx wrangler@latest d1 migrations apply potential-millionaires-erlc --remote`.
5. Add these private Worker secrets. Wrangler prompts for each value; do not paste them into this repository:

   ```powershell
   npx wrangler@latest secret put DISCORD_BOT_TOKEN
   npx wrangler@latest secret put DISCORD_OAUTH_CLIENT_SECRET
   npx wrangler@latest secret put ERLC_KEY_ENCRYPTION_SECRET
    npx wrangler@latest secret put TURNSTILE_SECRET_KEY
   ```

   Before deploying this version, create a Cloudflare Turnstile widget in **Managed** mode and allow only `potentialmillionaires.xyz` and `www.potentialmillionaires.xyz`. Add `TURNSTILE_SITE_KEY = "your-public-site-key"` under `[vars]` in `wrangler.toml` (the site key is public). Keep its secret key in the Worker secret above; never put it in GitHub Pages, `dashboard-config.js`, or chat. The dashboard retrieves only the public site key from `/security/config`.

   `ERLC_KEY_ENCRYPTION_SECRET` must be a new random value of at least 32 characters. Keep a secure backup; the saved ER:LC key cannot be decrypted without the same value.

6. Deploy with `npx wrangler@latest deploy`. Copy the HTTPS `workers.dev` URL shown by Wrangler. Set that exact URL in `PUBLIC_API_ORIGIN` in `wrangler.toml`, then deploy again.
7. In the Discord Developer Portal for application `1568360900648243281`, set OAuth2 Redirects to exactly:

   ```text
   https://YOUR-WORKER-URL.workers.dev/auth/discord/callback
   ```

   Replace `YOUR-WORKER-URL` with the deployed Worker URL. Remove the old Apps Script callback.

8. Set `window.PM_API_BASE_URL` in the root `dashboard-config.js` to the Worker URL, without a trailing slash, then commit the file to `main` so GitHub Pages publishes the dashboard.
9. The owner's first login should use the Discord server owner account. The ER:LC key is connected from the dashboard's **Connect ER:LC** page; it is tested, encrypted with AES-GCM before D1 storage, and never sent back to the browser.

## Discord and site settings

The OAuth client ID, log channel ID, Staff role ID, and HR role ID are already set as non-secret Worker variables in `wrangler.toml`. The server ID is detected from the configured log channel when `DISCORD_GUILD_ID` is blank. If detection fails, set the numeric Discord server ID in that variable and redeploy. The bot must be in the server, able to read the log channel, view guild members, and send messages to the log channel. In the Discord Developer Portal, enable **Server Members Intent** under Bot → Privileged Gateway Intents: Discord restricts the Get Guild Member endpoint used here to apps with the `GUILD_MEMBERS` intent.

GitHub Pages must have a valid HTTPS certificate before Discord sign-in is enabled. `ALLOWED_SITE_ORIGINS` intentionally allows only the HTTPS site origins so the short-lived dashboard session is never returned to an HTTP page.

## Data and security behavior

- Discord OAuth requests only the `identify` scope. The Worker uses its bot token to verify server membership and current roles on every protected request; the user's OAuth access token is not retained.
- Cloudflare Turnstile is verified server-side through Siteverify before Discord login starts and before a moderator join-code request is accepted. The Worker checks the returned hostname and action; tokens are single-use and expire after five minutes. If either Turnstile key is missing, new sign-ins and join-code requests fail closed.
- Session tokens and one-time OAuth state are stored as SHA-256 hashes in D1 and expire. Join codes are salted and hashed; a code request still needs explicit owner approval.
- The Discord server owner can create/revoke join codes, approve/deny access, revoke approval, and connect the ER:LC API key. Kick requires the Staff or HR role plus approval; ban/unban require HR or the server owner.
- ER:LC actions require confirmation and a reason, use a global command cooldown, and stop if the staff-log audit message cannot be posted.
- The ER:LC API key is encrypted in D1 using `ERLC_KEY_ENCRYPTION_SECRET`. Discord bot and OAuth secrets remain encrypted Worker secrets. None belong in GitHub files.
- D1 begins empty. Existing Apps Script join codes, pending requests, approvals, and connected ER:LC key do not migrate; the owner must connect the ER:LC key and create new moderator codes after deployment.

## Local development

For local-only credentials, create `worker/.dev.vars` (ignored by Git) with the four secret names shown above. Do not commit that file. Also set the public `TURNSTILE_SITE_KEY` in local `wrangler.toml` before using `npx wrangler@latest dev` from `worker`.
