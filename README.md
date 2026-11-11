# Potential Millionaires portfolio

A static, responsive portfolio and ER:LC control center for Potential Millionaires. It uses plain HTML, CSS, and JavaScript, so GitHub Pages can host it without a build step.

## Project links

Edit the `LINK_CONFIG` object near the top of `script.js`:

- `discordInviteUrl`: the Discord community invite.
- `botInviteUrl`: the bot's Discord OAuth invite.
- `drawCoasterUrl`: the Roblox game page URL.

Use full `https://` links. Never put a Discord bot token or private API key in these public files.

## ER:LC control center

Open `dashboard.html` for the dashboard panels: overview, join with code, member requests, players, moderation, server controls, shifts, action logs, role access, command guide, settings, and help. Panel navigation, mobile navigation, moderation previews, command previews, Discord sign-in handoff, join requests, invite management, and the backend health check are wired up in `dashboard.js`.

The dashboard is a static front end. The join form and owner request inbox call a secure backend API, but actual Discord login, code verification, approvals, and role enforcement do not work until that backend is implemented and connected. See [`docs/moderator-join-api.md`](docs/moderator-join-api.md) for the route contract and security requirements. Keep the ER:LC server key on the bot host, and enforce Discord sign-in and role checks on every backend request.

Set `DEFAULT_API_URL` near the top of `dashboard.js` after a backend has been deployed so all users get the same HTTPS endpoint. The Settings panel can save an override in the current browser only. If the existing Apps Script deployment is set to **Only myself**, it will reject moderator requests; implement server-side authorization before widening its access. Google documents `MYSELF` as access for only the deploying user and supports separate access settings for web-app deployments: [Apps Script web apps](https://developers.google.com/apps-script/guides/web).

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
- `dashboard.html`, `dashboard.css`, and `dashboard.js`: ER:LC dashboard and its panel interactions
- `docs/moderator-join-api.md`: API contract for Discord sign-in, join codes, and owner approvals
- `assets/`: optimized DrawCoaster screenshots captured from the supplied gameplay video
- `.github/workflows/deploy.yml`: deploys the site to GitHub Pages on pushes to `main`
