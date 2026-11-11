# Moderator join code API

The website is static. Its join form cannot securely validate a code or grant staff access by itself. Implement these routes in the private bot backend before enabling the flow. The front end sends requests to the HTTPS URL configured in `dashboard.js` (`DEFAULT_API_URL`) or saved in the Settings panel.

## Join flow

1. `GET /auth/discord/start?return_to=...` starts Discord OAuth with a one-time `state` value. Only allow the exact production callback URL. Request the minimum identity scope needed.
2. After validating OAuth `state` and the Discord identity, redirect to the allowlisted site URL with a short-lived opaque session token in the URL fragment: `#pm_session=<token>&panel=join`. Fragments are not sent in HTTP requests. Store only a hash of the token on the backend; the site keeps the short-lived token in `sessionStorage`.
3. `GET /api/session` returns the Discord identity, membership state, and whether the authenticated account is the configured owner.
4. `POST /api/membership/requests` accepts `{ "code": "ABC-123" }`. Validate the session, normalize and rate-limit the code, compare its hash, and create a pending request. A valid code does not grant staff permissions until the owner approves it.
5. Owner-only `GET /api/membership/requests` lists pending requests. Owner-only `POST /api/membership/requests/{id}` accepts `{ "decision": "accept" }` or `{ "decision": "deny" }`.
6. Owner-only `POST /api/membership/codes` creates a random code and returns it once as `{ "code": "..." }`. Store only a cryptographic hash, set an expiry/use limit, and log creation. `POST /api/membership/codes/revoke` revokes the active code.

All protected routes require `Authorization: Bearer <session-token>`. The front end uses `credentials: omit`; sessions should be short-lived, revocable, and bound to the Discord user ID. Never accept a user ID or role sent only by the browser as proof of identity.

## Backend requirements

- Verify Discord OAuth state, redirect URLs, sessions, and current Discord guild roles on the server.
- Restrict request creation and code attempts with per-user and per-IP rate limits; expire unused codes and pending sessions.
- Check membership and the member's configured Discord role on every future dashboard action. Owner approval must not silently grant Administrator permission.
- Keep the Discord bot token, OAuth client secret, and ER:LC server key in backend environment variables or secret properties, never in this repository or browser storage.
- Allow CORS only for `https://potentialmillionaires.xyz` (and the GitHub Pages origin if needed). Support preflight for `Authorization` and JSON requests.
- Return JSON errors without stack traces or secrets. Audit code creation/revocation, join decisions, and every moderation command.

The current site does not include a backend implementation. Until one is deployed, Discord sign-in, code verification, owner review, and moderator authorization cannot complete.
