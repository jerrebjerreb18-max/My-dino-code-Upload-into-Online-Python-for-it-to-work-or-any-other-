# Potential Millionaires portfolio

A static, responsive portfolio for Potential Millionaires. It uses plain HTML, CSS, and JavaScript and has no server, build step, private keys, or paid hosting requirement.

## Add your project links

Open `script.js` and fill in the `LINK_CONFIG` object near the top:

- `discordInviteUrl`: your permanent Discord community invite.
- `botInviteUrl`: optional Discord OAuth invite for the bot.
- `drawCoasterUrl`: the Roblox game page URL.

Use complete `https://` links. The site shows a helpful disabled state until each link is configured. Never put a Discord bot token or private API key in these files; GitHub Pages publishes them publicly.

## Publish with GitHub Pages

1. Create a public GitHub repository, for example `potential-millionaires-site`.
2. Upload `index.html`, `style.css`, `script.js`, and `CNAME` to the repository's top level. Keep the files together in the root.
3. In the repository, open **Settings → Pages**. Choose **Deploy from a branch**, select **main** and **/(root)**, then save.
4. In **Settings → Pages → Custom domain**, enter `potentialmillionaires.xyz` and save. Do this before changing the domain DNS records.
5. At Namecheap, open **Domain List → Manage → Advanced DNS → Host Records** and add the records listed below. Save all changes.
6. Wait for DNS to update. GitHub notes that DNS changes may take up to 24 hours. When GitHub Pages offers it, turn on **Enforce HTTPS**.

GitHub Pages is included at no extra monthly hosting charge for a public repository on GitHub Free. Your domain registration still renews through Namecheap at its renewal price.

## Namecheap DNS records

Use the records below for the apex domain and its `www` address. In Namecheap, set each record's TTL to **Automatic**.

| Type | Host | Value |
| --- | --- | --- |
| A Record | `@` | `185.199.108.153` |
| A Record | `@` | `185.199.109.153` |
| A Record | `@` | `185.199.110.153` |
| A Record | `@` | `185.199.111.153` |
| CNAME Record | `www` | `YOUR-GITHUB-USERNAME.github.io` |

Replace `YOUR-GITHUB-USERNAME` with the account that owns the GitHub repository. Do not include the repository name or `https://` in the CNAME value. If you use email on this domain, leave its MX and mail-related TXT records in place. Remove conflicting URL Redirect, A, or CNAME records for `@` and `www` only if they point those website hosts somewhere else.

Optional IPv6 records can also be added as AAAA records for host `@`:

- `2606:50c0:8000::153`
- `2606:50c0:8001::153`
- `2606:50c0:8002::153`
- `2606:50c0:8003::153`

This is a static portfolio only. It cannot run the Discord bot or perform private server-side actions; keep those on your bot host or a backend service.

