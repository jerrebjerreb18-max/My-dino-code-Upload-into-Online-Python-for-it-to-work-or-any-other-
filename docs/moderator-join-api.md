# Discord-gated dashboard API

The GitHub Pages frontend calls the Cloudflare Worker in `worker/index.js`. Configure the public HTTPS Worker origin in `dashboard-config.js`; secrets remain in Cloudflare Worker secrets. GitHub Pages does not host or run this API.

## Authentication and authorization

1. `GET /auth/discord/url?return_to=...` creates a one-use, expiring OAuth state and returns the Discord authorization URL. The return URL must be `/dashboard.html` on an allowlisted HTTPS site origin.
2. Discord redirects to `/auth/discord/callback`. The Worker consumes the one-use state, exchanges the code, reads the Discord identity, and verifies guild membership through the bot. It stores only a hash of a random six-hour session token, then returns the token in the dashboard URL fragment.
3. `GET /api/access` returns the user's current status. The Worker checks the member's present roles from Discord for every protected API call; browser-supplied role claims are never trusted.
4. A valid join code creates only a pending owner-review request. It never grants staff access by itself.
5. Only the server owner can create/revoke codes, approve/deny requests, revoke an approved account, or connect the ER:LC key.
6. Staff or HR plus owner approval can view moderation pages and perform kick/check-ban actions. HR or the server owner can ban/unban. Every destructive action requires an explicit review/confirmation and audit-log delivery before sending to ER:LC.

## Routes

| Route | Access |
| --- | --- |
| `GET /health` | Public reachability/configuration summary; returns no secrets or server data |
| `GET /auth/discord/url` | Public; creates short-lived OAuth state |
| `GET /auth/discord/callback` | Discord OAuth callback |
| `GET /api/access` | Signed-in Discord server member |
| `POST /api/logout` | Revokes the presented session |
| `POST /api/membership/requests` | Signed-in member submits a join code |
| `GET /api/membership/requests` | Server owner only |
| `POST /api/membership/codes` | Server owner only |
| `DELETE /api/membership/codes` | Server owner only |
| `POST /api/membership/requests/{discord_user_id}` | Server owner only; body uses `decision: approve` or `deny` |
| `DELETE /api/membership/users/{discord_user_id}` | Server owner only |
| `POST /api/erlc/key` | Server owner only; validates then encrypts the key in D1 |
| `GET /api/health`, `/api/players` | Approved dashboard member; current roles checked |
| `GET /api/bans`, `/api/check-ban?roblox_id=...` | Approved Staff/HR member or server owner |
| `POST /api/command` | Kick: Staff/HR; ban/unban: HR; requires confirmation and reason |

## Data safeguards

- OAuth state and sessions are random, short-lived, single-use where applicable, and stored by SHA-256 hash.
- The dashboard stores the short-lived session in `sessionStorage`; it never stores bot, OAuth, or ER:LC credentials.
- The ER:LC key is validated before it replaces a working key, then encrypted with AES-GCM before D1 storage.
- Join codes are salted and hashed, expire after seven days, and allow up to 50 requests. Attempts are rate-limited.
- CORS allows only the configured HTTPS site origins. Do not enable HTTP origins because the OAuth session token is returned to the page.
- Add Discord bot token, OAuth client secret, and key-encryption secret through Wrangler/Cloudflare secret settings only. Never commit secrets or `.dev.vars`.

The full deployment instructions and required backend settings are in [`worker/README.md`](../worker/README.md).
