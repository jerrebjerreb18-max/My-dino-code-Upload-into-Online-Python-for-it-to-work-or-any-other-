# Potential Millionaires ER:LC dashboard

The website stays on GitHub Pages. A Cloudflare Worker provides the private API for Discord sign-in, current server-role checks, moderator access, and ER:LC commands. Private credentials are stored as GitHub Actions secrets and Cloudflare Worker secrets; they are never committed to the public website.

## One-time setup

### 1. Add GitHub Actions secrets

Open the repository's **Settings → Secrets and variables → Actions → New repository secret**. Add these names and values:

| Secret name | Value |
| --- | --- |
| `CLOUDFLARE_API_TOKEN` | Cloudflare API token with **Workers Scripts: Edit**, **D1: Read**, and **D1: Edit** permissions for the account. |
| `CLOUDFLARE_ACCOUNT_ID` | The Cloudflare account ID. |
| `DISCORD_BOT_TOKEN` | The bot token from the Discord Developer Portal. |
| `DISCORD_OAUTH_CLIENT_SECRET` | The OAuth client secret for application `1568360900648243281`. |
| `ERLC_KEY_ENCRYPTION_SECRET` | A private random value at least 32 characters long. Keep a secure backup; losing it makes the encrypted ER:LC key unreadable. |

Do not paste these values into chat or into a repository file. The ER:LC server key is entered later in the dashboard and is encrypted by the Worker before database storage.

### 2. Deploy from GitHub

Open **Actions → Deploy ERLC backend and website → Run workflow**, choose the `main` branch, and start it. The workflow creates or reuses the D1 database, applies its schema, deploys the Worker with the private secrets, checks the live health and Discord login URL endpoints, writes the public Worker URL to `dashboard-config.js`, and publishes the website.

The workflow summary prints the exact Discord OAuth redirect URI after the backend is deployed.

### 3. Update the Discord OAuth redirect

In the Discord Developer Portal for application `1568360900648243281`, open **OAuth2 → Redirects**. Remove the old Apps Script callback and add the exact Worker callback printed in the successful GitHub Actions run. Save the application settings.

The dashboard uses the `identify` scope. Under **Bot → Privileged Gateway Intents**, enable **Server Members Intent**. The bot must be in the server and able to view the configured staff-log channel so the backend can detect the server ID when `DISCORD_GUILD_ID` is blank.

### 4. Sign in

Open [https://potentialmillionaires.xyz/dashboard.html](https://potentialmillionaires.xyz/dashboard.html) over HTTPS and reload. The button should prepare a Discord authorization link. After Discord redirects back, the Worker verifies server membership. Moderator access still requires a valid join code and owner approval.

## Security and behavior

- The website contains only the public Worker origin. Bot, OAuth, encryption, and ER:LC keys are never placed in GitHub Pages files.
- Discord OAuth requests only `identify`. Session tokens and one-time OAuth state are stored as SHA-256 hashes in D1 and expire.
- The Worker checks the user's current server membership and roles on protected requests. The user OAuth access token is not retained.
- The server owner can manage join codes and moderator approvals. Kick requires an approved Staff or HR role; ban/unban require HR or the server owner.
- ER:LC actions require a reason and confirmation, observe a global cooldown, and stop if the audit log message cannot be posted.
- The ER:LC key is encrypted in D1 using `ERLC_KEY_ENCRYPTION_SECRET`. D1 does not import existing Apps Script approvals, join codes, or ER:LC settings; connect ER:LC and issue new codes after deployment.

## Later deployments

Run **Actions → Deploy ERLC backend and website → Run workflow** again after changing Worker code, migrations, or secret values. Ordinary site updates continue to publish through the existing GitHub Pages workflow.
