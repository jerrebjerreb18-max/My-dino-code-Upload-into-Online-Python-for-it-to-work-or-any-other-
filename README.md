# Potential Millionaires portfolio

A static, responsive portfolio and ER:LC control center for Potential Millionaires. It uses plain HTML, CSS, and JavaScript, so GitHub Pages can host it without a build step.

## Project links

Edit the `LINK_CONFIG` object near the top of `script.js`:

- `discordInviteUrl`: the Discord community invite.
- `botInviteUrl`: the bot's Discord OAuth invite.
- `drawCoasterUrl`: the Roblox game page URL.

Use full `https://` links. Never put a Discord bot token or private API key in these public files.

## ER:LC control center

`dashboard.html` is the GitHub Pages frontend. It connects to the private Cloudflare Worker API configured in `dashboard-config.js`. Staff sign in with Discord; the Worker checks owner approval and current Discord roles for protected actions. The owner connects or replaces the ER:LC private-server key from the **Connect ER:LC** page inside that dashboard.

GitHub Pages only hosts public static files; it does not run the private API. The Worker stores Discord secrets as encrypted backend secrets and encrypts the ER:LC key before storing it in D1. The key is tested before saving and is never returned to the browser. Never put bot tokens, OAuth secrets, or the ER:LC key in this repository or `dashboard-config.js`.

Follow [`worker/README.md`](worker/README.md) to create the D1 database, deploy the Worker, set private secrets, and configure the exact Discord OAuth callback. The Worker can discover the Discord server ID from the staff-log channel when the `DISCORD_GUILD_ID` variable is left blank; otherwise set the numeric server ID in the Worker configuration.

## Finish GitHub Pages setup

The repository has a GitHub Actions Pages workflow that publishes updates pushed to `main`.

1. Open [repository Pages settings](https://github.com/jerrebjerreb18-max/My-dino-code-Upload-into-Online-Python-for-it-to-work-or-any-other-/settings/pages). Make sure **Build and deployment → Source** is **GitHub Actions**.
2. In **Custom domain**, enter `potentialmillionaires.xyz` and click **Save**. The `CNAME` file does not set the custom domain when using a GitHub Actions workflow; this Pages setting is required.
3. In Namecheap, open **Domain List → Manage → Advanced DNS → Host Records**. Remove the Namecheap parking record for `@` and any conflicting website records for `@` or `www`, then add the records below. Keep MX and mail-related TXT records if you use domain email.
4. Wait for DNS to propagate. Then return to Pages settings and turn on **Enforce HTTPS** when GitHub enables it.

GitHub Pages hosting is available at no extra monthly charge for a public repository on GitHub Free. Your domain registration still renews through Namecheap.

## Namecheap DNS records

Set TTL to **Automatic**. Add four A records:

| Type | Host | Value |
| --- | --- | --- |
| A Record | `@` | `185.199.108.153` |
| A Record | `@` | `185.199.109.153` |
| A Record | `@` | `185.199.110.153` |
| A Record | `@` | `185.199.111.153` |
| CNAME Record | `www` | `jerrebjerreb18-max.github.io` |

Do not put the repository name or `https://` in the CNAME value. DNS changes can take up to 24 hours to propagate.

## Files

- `index.html`: site content and layout
- `style.css`: responsive visual design
- `script.js`: navigation, interactions, and project links
- `dashboard.html`: Discord-gated ER:LC control center
- `dashboard-config.js`: public Worker URL only; no secrets
- `worker/`: Cloudflare Worker API, D1 schema, and deployment instructions
- `docs/moderator-join-api.md`: dashboard API and access-control contract
- `assets/`: optimized DrawCoaster screenshots captured from the supplied gameplay video
- `.github/workflows/deploy.yml`: deploys the site to GitHub Pages on pushes to `main`
