const DISCORD_API = "https://discord.com/api/v10";
const ERLC_API = "https://api.erlc.gg";
const DEFAULT_LOG_CHANNEL = "1568344574714191882";
const DEFAULT_STAFF_ROLE = "1568344466375442604";
const DEFAULT_HR_ROLE = "1568344448612569119";
const SESSION_TTL = 6 * 60 * 60 * 1000;
const JOIN_CODE_TTL = 7 * 24 * 60 * 60 * 1000;
const JOIN_CODE_LIMIT = 50;
const encoder = new TextEncoder();
let guildIdCache = "";
let guildInfoCache = null;
let guildInfoCacheAt = 0;

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
      "referrer-policy": "same-origin",
      ...headers,
    },
  });
}

function html(message, status = 400) {
  const safe = String(message).replace(/[&<>"']/g, character => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character]);
  return new Response("<!doctype html><meta charset=utf-8><meta name=viewport content='width=device-width'><title>Discord sign-in</title><main style='font:16px system-ui;max-width:620px;margin:12vh auto;padding:28px;background:#171d26;color:#f2f5f8;border-radius:16px'><h1>Sign-in needs attention</h1><p>" + safe + "</p><p>Return to the Potential Millionaires dashboard and try again.</p></main>", {
    status,
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff" },
  });
}

function allowedOrigins(env) {
  const configured = String(env.ALLOWED_SITE_ORIGINS || "https://potentialmillionaires.xyz,https://www.potentialmillionaires.xyz");
  return new Set(configured.split(",").map(value => value.trim()).filter(Boolean));
}

function corsHeaders(request, env) {
  const origin = request.headers.get("origin") || "";
  const allowed = allowedOrigins(env);
  const headers = { vary: "Origin", "access-control-allow-methods": "GET, POST, DELETE, OPTIONS", "access-control-allow-headers": "Authorization, Content-Type", "access-control-max-age": "86400" };
  if (allowed.has(origin)) headers["access-control-allow-origin"] = origin;
  return headers;
}

function safeMessage(value, env, extraSecret = "") {
  let result = String(value || "");
  for (const secret of [extraSecret, env.ERLC_SERVER_KEY, env.DISCORD_BOT_TOKEN, env.DISCORD_OAUTH_CLIENT_SECRET]) {
    if (secret) result = result.split(String(secret)).join("[redacted]");
  }
  return result.replaceAll("@", "@\u200b").replaceAll("`", "ˋ").slice(0, 500);
}

function parseJson(text, fallback = {}) {
  try { return text ? JSON.parse(text) : fallback; } catch { return fallback; }
}

function bytesToHex(bytes) {
  return Array.from(new Uint8Array(bytes), value => value.toString(16).padStart(2, "0")).join("");
}

function randomHex(byteCount) {
  const bytes = new Uint8Array(byteCount);
  crypto.getRandomValues(bytes);
  return bytesToHex(bytes);
}

async function sha256Hex(value) {
  return bytesToHex(await crypto.subtle.digest("SHA-256", encoder.encode(String(value))));
}

function bytesToBase64(bytes) {
  let binary = "";
  for (const byte of new Uint8Array(bytes)) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64ToBytes(value) {
  return Uint8Array.from(atob(value), character => character.charCodeAt(0));
}

async function encryptionKey(env) {
  const secret = String(env.ERLC_KEY_ENCRYPTION_SECRET || "");
  if (secret.length < 32) throw new HttpError(503, "The owner must configure the ERLC_KEY_ENCRYPTION_SECRET backend secret before connecting ER:LC.");
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(secret));
  return crypto.subtle.importKey("raw", digest, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

async function encryptServerKey(env, value) {
  const iv = new Uint8Array(12);
  crypto.getRandomValues(iv);
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await encryptionKey(env), encoder.encode(value));
  return JSON.stringify({ iv: bytesToBase64(iv), ciphertext: bytesToBase64(ciphertext) });
}

async function decryptServerKey(env, packed) {
  const record = parseJson(packed, null);
  if (!record || !record.iv || !record.ciphertext) throw new HttpError(503, "The saved ER:LC key could not be read. Ask the owner to reconnect it.");
  try {
    const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: base64ToBytes(record.iv) }, await encryptionKey(env), base64ToBytes(record.ciphertext));
    return new TextDecoder().decode(plain);
  } catch {
    throw new HttpError(503, "The ER:LC key could not be decrypted. Restore the original encryption secret or reconnect the key.");
  }
}

async function requireDatabase(env) {
  if (!env.DB) throw new HttpError(503, "The backend database is not configured. Follow worker/README.md to bind the D1 database.");
}

async function discordRequest(path, token, scheme = "Bot", options = {}) {
  const response = await fetch(DISCORD_API + path, {
    ...options,
    headers: { authorization: scheme + " " + token, accept: "application/json", ...(options.headers || {}) },
    signal: AbortSignal.timeout(12000),
  });
  const bodyText = await response.text();
  const body = parseJson(bodyText, {});
  if (!response.ok) {
    const status = response.status === 404 ? 404 : response.status === 401 || response.status === 403 ? 503 : 502;
    const message = response.status === 404 ? "The Discord account is not in the configured server." : "Discord API returned HTTP " + response.status + ". Check the bot token, server access, and requested OAuth scope.";
    throw new HttpError(status, message);
  }
  return body;
}

async function botRequest(env, path, options = {}) {
  const token = String(env.DISCORD_BOT_TOKEN || "").trim();
  if (!token) throw new HttpError(503, "Add DISCORD_BOT_TOKEN as a private backend secret before enabling Discord membership checks.");
  return discordRequest(path, token, "Bot", options);
}

async function guildId(env) {
  const configured = String(env.DISCORD_GUILD_ID || "").trim();
  if (configured) {
    if (!/^\d{15,22}$/.test(configured)) throw new HttpError(503, "DISCORD_GUILD_ID must be the numeric Discord server ID.");
    return configured;
  }
  if (guildIdCache) return guildIdCache;
  const channelId = String(env.DISCORD_LOG_CHANNEL_ID || DEFAULT_LOG_CHANNEL).trim();
  if (!/^\d{15,22}$/.test(channelId)) throw new HttpError(503, "Set a numeric DISCORD_GUILD_ID backend variable.");
  try {
    const channel = await botRequest(env, "/channels/" + encodeURIComponent(channelId));
    if (!/^\d{15,22}$/.test(String(channel.guild_id || ""))) throw new Error("missing guild id");
    guildIdCache = String(channel.guild_id);
    return guildIdCache;
  } catch {
    throw new HttpError(503, "Set DISCORD_GUILD_ID in the backend, or give the bot access to the configured staff-log channel so the server ID can be detected.");
  }
}

async function guildInfo(env) {
  const id = await guildId(env);
  const ownerOverride = String(env.DISCORD_OWNER_ID || "").trim();
  if (ownerOverride && !/^\d{15,22}$/.test(ownerOverride)) throw new HttpError(503, "DISCORD_OWNER_ID must be a numeric Discord user ID.");
  if (guildInfoCache && Date.now() - guildInfoCacheAt < 300000 && guildInfoCache.id === id) {
    return { ...guildInfoCache, ownerId: ownerOverride || guildInfoCache.ownerId };
  }
  const guild = await botRequest(env, "/guilds/" + encodeURIComponent(id));
  const result = { id, ownerId: ownerOverride || String(guild.owner_id || ""), name: String(guild.name || "Potential Millionaires") };
  if (!/^\d{15,22}$/.test(result.ownerId)) throw new HttpError(503, "Could not verify the Discord server owner. Configure DISCORD_OWNER_ID in the backend.");
  guildInfoCache = result;
  guildInfoCacheAt = Date.now();
  return result;
}

async function guildMember(env, userId) {
  const id = await guildId(env);
  return botRequest(env, "/guilds/" + encodeURIComponent(id) + "/members/" + encodeURIComponent(userId));
}

async function getSession(request, env) {
  await requireDatabase(env);
  const authorization = String(request.headers.get("authorization") || "");
  const token = authorization.replace(/^Bearer\s+/i, "").trim();
  if (!/^[a-f0-9]{64}$/i.test(token)) throw new HttpError(401, "Sign in with Discord to continue.");
  const hash = await sha256Hex(token);
  const row = await env.DB.prepare("SELECT user_id, username, expires_at FROM dashboard_sessions WHERE token_hash = ?").bind(hash).first();
  if (!row || Number(row.expires_at) <= Date.now()) {
    if (row) await env.DB.prepare("DELETE FROM dashboard_sessions WHERE token_hash = ?").bind(hash).run();
    throw new HttpError(401, "Your dashboard session expired. Sign in with Discord again.");
  }
  const member = await guildMember(env, String(row.user_id));
  const guild = await guildInfo(env);
  const roles = Array.isArray(member.roles) ? member.roles.map(String) : [];
  const approved = String(row.user_id) === guild.ownerId || Boolean(await env.DB.prepare("SELECT user_id FROM approved_moderators WHERE user_id = ?").bind(String(row.user_id)).first());
  const pending = !approved && Boolean(await env.DB.prepare("SELECT user_id FROM moderator_requests WHERE user_id = ?").bind(String(row.user_id)).first());
  const staffRole = String(env.DISCORD_STAFF_ROLE_ID || DEFAULT_STAFF_ROLE);
  const hrRole = String(env.DISCORD_HR_ROLE_ID || DEFAULT_HR_ROLE);
  const owner = String(row.user_id) === guild.ownerId;
  return {
    user: { id: String(row.user_id), name: String(row.username || "Discord member") },
    member,
    roles,
    guild,
    isOwner: owner,
    isApproved: owner || approved,
    isPending: pending,
    hasStaffRole: roles.includes(staffRole) || roles.includes(hrRole),
    hasSeniorRole: roles.includes(hrRole),
  };
}

async function requireAccess(request, env) {
  const session = await getSession(request, env);
  if (!session.isApproved) throw new HttpError(403, "Moderator dashboard access has not been approved yet. Enter the join code and wait for the owner to approve it.");
  return session;
}

async function requireModerator(request, env) {
  const session = await requireAccess(request, env);
  if (!session.isOwner && !session.hasStaffRole) throw new HttpError(403, "This action requires the configured Discord Staff role.");
  return session;
}

async function requireSenior(request, env) {
  const session = await requireAccess(request, env);
  if (!session.isOwner && !session.hasSeniorRole) throw new HttpError(403, "Ban and unban require the configured HR role.");
  return session;
}

async function requireOwner(request, env) {
  const session = await getSession(request, env);
  if (!session.isOwner) throw new HttpError(403, "Only the Discord server owner can manage this setting.");
  return session;
}

function accessSummary(session) {
  const status = session.isOwner ? "owner" : session.isApproved ? "approved" : session.isPending ? "pending" : "join_required";
  return {
    user: session.user,
    status,
    canView: session.isApproved,
    canModerate: session.isOwner || (session.isApproved && session.hasStaffRole),
    canSenior: session.isOwner || (session.isApproved && session.hasSeniorRole),
    isOwner: session.isOwner,
    hasStaffRole: session.hasStaffRole,
    hasSeniorRole: session.hasSeniorRole,
    guildName: session.guild.name,
  };
}

async function createDiscordLoginUrl(request, env) {
  await requireDatabase(env);
  const clientId = String(env.DISCORD_OAUTH_CLIENT_ID || "1568360900648243281").trim();
  const clientSecret = String(env.DISCORD_OAUTH_CLIENT_SECRET || "").trim();
  const apiOrigin = new URL(request.url).origin;
  if (!clientId || !clientSecret) throw new HttpError(503, "The owner must configure DISCORD_OAUTH_CLIENT_SECRET in the backend before Discord sign-in can work.");
  const url = new URL(request.url);
  const returnTo = String(url.searchParams.get("return_to") || "");
  let target;
  try { target = new URL(returnTo); } catch { throw new HttpError(400, "The dashboard return URL is invalid."); }
  if (!allowedOrigins(env).has(target.origin) || target.pathname !== "/dashboard.html" || target.search) throw new HttpError(400, "The dashboard return URL is not on the approved site list.");
  const state = randomHex(24);
  await env.DB.prepare("INSERT INTO oauth_states (state_hash, return_to, expires_at, consumed_at) VALUES (?, ?, ?, NULL)").bind(await sha256Hex(state), target.origin + target.pathname, Date.now() + 10 * 60 * 1000).run();
  const redirectUri = apiOrigin + "/auth/discord/callback";
  const authorize = new URL("https://discord.com/oauth2/authorize");
  authorize.searchParams.set("client_id", clientId);
  authorize.searchParams.set("redirect_uri", redirectUri);
  authorize.searchParams.set("response_type", "code");
  authorize.searchParams.set("scope", "identify");
  authorize.searchParams.set("state", state);
  return { url: authorize.toString() };
}

async function discordOAuthCallback(request, env) {
  const url = new URL(request.url);
  if (url.searchParams.has("error")) return html("Discord sign-in was cancelled. Return to the dashboard and try again.");
  const state = String(url.searchParams.get("state") || "");
  const code = String(url.searchParams.get("code") || "");
  if (!/^[a-f0-9]{48}$/i.test(state) || !code) return html("Discord did not return a valid sign-in response.");
  await requireDatabase(env);
  const now = Date.now();
  const stateRow = await env.DB.prepare("UPDATE oauth_states SET consumed_at = ? WHERE state_hash = ? AND consumed_at IS NULL AND expires_at > ? RETURNING return_to").bind(now, await sha256Hex(state), now).first();
  if (!stateRow) return html("This Discord sign-in request expired or was already used. Start a new sign-in from the dashboard.");
  const clientId = String(env.DISCORD_OAUTH_CLIENT_ID || "1568360900648243281").trim();
  const clientSecret = String(env.DISCORD_OAUTH_CLIENT_SECRET || "").trim();
  const apiOrigin = url.origin;
  const redirectUri = apiOrigin + "/auth/discord/callback";
  const form = new URLSearchParams({ client_id: clientId, client_secret: clientSecret, grant_type: "authorization_code", code, redirect_uri: redirectUri });
  const tokenResponse = await fetch(DISCORD_API + "/oauth2/token", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" }, body: form, signal: AbortSignal.timeout(12000) });
  const tokenBody = parseJson(await tokenResponse.text(), {});
  if (!tokenResponse.ok || !tokenBody.access_token) {
    const knownErrors = new Set(["invalid_client", "invalid_grant", "invalid_request", "unauthorized_client", "unsupported_grant_type"]);
    const reportedError = String(tokenBody.error || "").toLowerCase();
    const safeError = knownErrors.has(reportedError) ? reportedError : "unknown_error";
    console.error("Discord OAuth token exchange rejected", { status: tokenResponse.status, error: safeError });
    return html("Discord rejected the OAuth code exchange (HTTP " + tokenResponse.status + "; " + safeError + "). Start a fresh sign-in from the dashboard.");
  }
  const profile = await discordRequest("/users/@me", tokenBody.access_token, "Bearer");
  const userId = String(profile.id || "");
  if (!/^\d{15,22}$/.test(userId)) return html("Discord did not return a valid account ID.");
  await guildMember(env, userId);
  const sessionToken = randomHex(32);
  await env.DB.prepare("INSERT INTO dashboard_sessions (token_hash, user_id, username, created_at, expires_at) VALUES (?, ?, ?, ?, ?)").bind(await sha256Hex(sessionToken), userId, String(profile.global_name || profile.username || "Discord member").slice(0, 80), now, now + SESSION_TTL).run();
  const target = new URL(String(stateRow.return_to));
  target.hash = "pm_session=" + encodeURIComponent(sessionToken) + "&panel=join";
  return Response.redirect(target.toString(), 302);
}

function pick(object, names, fallback = null) {
  for (const name of names) if (object && object[name] !== undefined && object[name] !== null) return object[name];
  return fallback;
}

function normalizePlayers(payload) {
  if (!Array.isArray(payload)) return [];
  return payload.flatMap(item => {
    let raw = typeof item === "string" ? item : pick(item, ["Player", "player", "Username", "Name"], "");
    if (raw && typeof raw === "object") raw = pick(raw, ["Username", "Name"], "");
    const match = String(raw || "").trim().match(/^(.+):([0-9]{1,20})$/);
    if (!match || !/^[A-Za-z0-9_]{1,20}$/.test(match[1].trim())) return [];
    return [{ name: match[1].trim(), id: match[2], team: typeof item === "string" ? "" : String(pick(item, ["Team"], "")).slice(0, 50), permission: typeof item === "string" ? "" : String(pick(item, ["Permission"], "")).slice(0, 40) }];
  });
}

function normalizeBans(payload) {
  let value = payload;
  const out = [];
  if (value && !Array.isArray(value) && typeof value === "object") {
    const nested = pick(value, ["Bans", "bans"], null);
    if (nested && (Array.isArray(nested) || typeof nested === "object")) value = nested;
    else {
      for (const [id, name] of Object.entries(value)) if (/^[0-9]{1,20}$/.test(id)) out.push({ id, name: String(name).slice(0, 80) });
      return out;
    }
  }
  if (Array.isArray(value)) for (const item of value) {
    if (typeof item === "string") {
      const match = item.trim().match(/^(.+):([0-9]{1,20})$/);
      if (match) out.push({ name: match[1].slice(0, 80), id: match[2] });
    } else if (item && typeof item === "object") {
      const id = String(pick(item, ["PlayerId", "UserId", "Id"], ""));
      if (/^[0-9]{1,20}$/.test(id)) out.push({ id, name: String(pick(item, ["PlayerName", "Username", "Name"], "Unknown")).slice(0, 80) });
    }
  }
  else if (value && typeof value === "object") for (const [id, name] of Object.entries(value)) if (/^[0-9]{1,20}$/.test(id)) out.push({ id, name: String(name).slice(0, 80) });
  return out;
}

function serverSummary(payload) {
  const rawPlayers = pick(payload, ["CurrentPlayers", "Players"], null);
  const players = Array.isArray(rawPlayers) ? rawPlayers.length : rawPlayers !== null && Number.isFinite(Number(rawPlayers)) ? Number(rawPlayers) : null;
  const maxPlayers = Number(pick(payload, ["MaxPlayers"], NaN));
  return { name: String(pick(payload, ["Name", "ServerName"], "ER:LC private server")).slice(0, 100), players, maxPlayers: Number.isFinite(maxPlayers) ? maxPlayers : null };
}

async function readServerKey(env) {
  const row = await env.DB.prepare("SELECT value FROM private_settings WHERE key = 'ERLC_SERVER_KEY'").first();
  if (!row) throw new HttpError(503, "ER:LC API is not connected yet. The server owner can connect it from the dashboard.");
  return decryptServerKey(env, row.value);
}

async function erlcRequest(env, path, options = {}, overrideKey = "") {
  const key = overrideKey || await readServerKey(env);
  const response = await fetch(ERLC_API + path, {
    ...options,
    headers: { "server-key": key, accept: "application/json", ...(options.body ? { "content-type": "application/json" } : {}), ...(options.headers || {}) },
    signal: AbortSignal.timeout(15000),
  });
  const bodyText = await response.text();
  if (!response.ok) throw new HttpError(502, "ER:LC API returned HTTP " + response.status + (bodyText ? ": " + safeMessage(bodyText, env, key) : "."));
  if (!bodyText) return {};
  try { return JSON.parse(bodyText); } catch { return { message: bodyText.slice(0, 200) }; }
}

async function writeAudit(env, content) {
  const token = String(env.DISCORD_BOT_TOKEN || "").trim();
  const channelId = String(env.DISCORD_LOG_CHANNEL_ID || DEFAULT_LOG_CHANNEL).trim();
  if (!token || !/^\d{15,22}$/.test(channelId)) return false;
  const response = await fetch(DISCORD_API + "/channels/" + channelId + "/messages", {
    method: "POST",
    headers: { authorization: "Bot " + token, "content-type": "application/json" },
    body: JSON.stringify({ content: String(content).replaceAll("@", "@\u200b").slice(0, 1800), allowed_mentions: { parse: [] } }),
    signal: AbortSignal.timeout(8000),
  });
  return response.ok;
}

async function ownerRequests(env) {
  const pending = await env.DB.prepare("SELECT user_id AS userId, name, created_at AS requestedAt, id FROM moderator_requests ORDER BY created_at").all();
  const approved = await env.DB.prepare("SELECT user_id AS userId, name, approved_at AS approvedAt FROM approved_moderators ORDER BY approved_at DESC").all();
  return { requests: pending.results || [], approved: approved.results || [] };
}

async function handleApi(request, env, url) {
  await requireDatabase(env);
  if (request.method === "POST" && url.pathname === "/api/logout") {
    const token = String(request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
    if (/^[a-f0-9]{64}$/i.test(token)) await env.DB.prepare("DELETE FROM dashboard_sessions WHERE token_hash = ?").bind(await sha256Hex(token)).run();
    return json({ ok: true });
  }

  if (request.method === "GET" && url.pathname === "/api/access") return json(accessSummary(await getSession(request, env)));

  if (request.method === "POST" && url.pathname === "/api/membership/requests") {
    const session = await getSession(request, env);
    if (session.isOwner) return json({ ok: true, status: "owner", message: "You are the server owner." });
    if (session.isApproved) return json({ ok: true, status: "approved", message: "Your dashboard access is already active." });
    const body = await request.json().catch(() => ({}));
    const code = String(body.code || "").trim().toUpperCase();
    if (!/^[A-Z0-9-]{3,20}$/.test(code)) throw new HttpError(400, "Enter a 3–20 character join code using letters, numbers, or hyphens.");
    const now = Date.now();
    const bucket = Math.floor(now / 600000) * 600000;
    await env.DB.prepare("INSERT INTO join_code_attempts (user_id, bucket, attempts) VALUES (?, ?, 1) ON CONFLICT(user_id) DO UPDATE SET attempts = CASE WHEN join_code_attempts.bucket = excluded.bucket THEN join_code_attempts.attempts + 1 ELSE 1 END, bucket = excluded.bucket").bind(session.user.id, bucket).run();
    const attempt = await env.DB.prepare("SELECT attempts FROM join_code_attempts WHERE user_id = ?").bind(session.user.id).first();
    if (Number(attempt.attempts) > 5) throw new HttpError(429, "Too many code attempts. Wait 10 minutes and try again.");
    if (await env.DB.prepare("SELECT id FROM moderator_requests WHERE user_id = ?").bind(session.user.id).first()) return json({ ok: true, status: "pending", message: "Your request is already waiting for the owner." });
    const pendingCount = await env.DB.prepare("SELECT COUNT(*) AS total FROM moderator_requests").first();
    if (Number(pendingCount.total) >= 50) throw new HttpError(409, "The request queue is full. Ask the owner to review it before trying again.");
    const codeRow = await env.DB.prepare("SELECT code_hash, salt, expires_at, uses, max_uses FROM moderator_join_code WHERE id = 1").first();
    if (!codeRow || Number(codeRow.expires_at) <= now || Number(codeRow.uses) >= Number(codeRow.max_uses) || await sha256Hex(code + "|" + codeRow.salt) !== codeRow.code_hash) throw new HttpError(400, "That join code is invalid or expired. Ask the server owner for a current code.");
    const claim = await env.DB.prepare("UPDATE moderator_join_code SET uses = uses + 1 WHERE id = 1 AND code_hash = ? AND expires_at > ? AND uses < max_uses RETURNING uses").bind(codeRow.code_hash, now).first();
    if (!claim) throw new HttpError(400, "That join code is invalid, expired, or has reached its request limit.");
    const requestId = randomHex(16);
    await env.DB.prepare("INSERT INTO moderator_requests (id, user_id, name, created_at) VALUES (?, ?, ?, ?)").bind(requestId, session.user.id, session.user.name, now).run();
    await writeAudit(env, "📝 Moderator dashboard access requested by " + session.user.name + " (" + session.user.id + ").");
    return json({ ok: true, status: "pending", message: "Request sent. The server owner must approve it before moderator access is enabled." });
  }

  if (request.method === "GET" && url.pathname === "/api/membership/requests") {
    await requireOwner(request, env);
    return json(await ownerRequests(env));
  }

  if (request.method === "POST" && url.pathname === "/api/membership/codes") {
    const owner = await requireOwner(request, env);
    const code = randomHex(8).toUpperCase();
    const salt = randomHex(16);
    const hash = await sha256Hex(code + "|" + salt);
    const expiresAt = Date.now() + JOIN_CODE_TTL;
    await env.DB.prepare("INSERT INTO moderator_join_code (id, code_hash, salt, expires_at, uses, max_uses, created_by) VALUES (1, ?, ?, ?, 0, ?, ?) ON CONFLICT(id) DO UPDATE SET code_hash = excluded.code_hash, salt = excluded.salt, expires_at = excluded.expires_at, uses = 0, max_uses = excluded.max_uses, created_by = excluded.created_by").bind(hash, salt, expiresAt, JOIN_CODE_LIMIT, owner.user.id).run();
    await writeAudit(env, "🔐 " + owner.user.name + " created a moderator dashboard join code (expires in 7 days; up to 50 requests).");
    return json({ code, expiresAt, maxUses: JOIN_CODE_LIMIT });
  }

  if (request.method === "DELETE" && url.pathname === "/api/membership/codes") {
    const owner = await requireOwner(request, env);
    await env.DB.prepare("DELETE FROM moderator_join_code WHERE id = 1").run();
    await writeAudit(env, "🔒 " + owner.user.name + " revoked the moderator dashboard join code.");
    return json({ ok: true });
  }

  const requestMatch = url.pathname.match(/^\/api\/membership\/requests\/(\d{15,22})$/);
  if (request.method === "POST" && requestMatch) {
    const owner = await requireOwner(request, env);
    const body = await request.json().catch(() => ({}));
    const decision = String(body.decision || "");
    if (decision !== "approve" && decision !== "deny") throw new HttpError(400, "Choose approve or deny.");
    const memberRequest = await env.DB.prepare("SELECT user_id, name FROM moderator_requests WHERE user_id = ?").bind(requestMatch[1]).first();
    if (!memberRequest) throw new HttpError(404, "That request is no longer waiting for review. Refresh the list.");
    if (decision === "approve") {
      const count = await env.DB.prepare("SELECT COUNT(*) AS total FROM approved_moderators").first();
      if (Number(count.total) >= 50) throw new HttpError(409, "The approved moderator list is full.");
      await env.DB.batch([
        env.DB.prepare("INSERT INTO approved_moderators (user_id, name, approved_at, approved_by) VALUES (?, ?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET name = excluded.name, approved_at = excluded.approved_at, approved_by = excluded.approved_by").bind(String(memberRequest.user_id), String(memberRequest.name), Date.now(), owner.user.id),
        env.DB.prepare("DELETE FROM moderator_requests WHERE user_id = ?").bind(requestMatch[1]),
      ]);
    } else await env.DB.prepare("DELETE FROM moderator_requests WHERE user_id = ?").bind(requestMatch[1]).run();
    await writeAudit(env, (decision === "approve" ? "✅ " : "⛔ ") + owner.user.name + " " + decision + "d dashboard access for " + memberRequest.name + " (" + memberRequest.user_id + ").");
    return json({ ok: true, decision });
  }

  const revokeMatch = url.pathname.match(/^\/api\/membership\/users\/(\d{15,22})$/);
  if (request.method === "DELETE" && revokeMatch) {
    const owner = await requireOwner(request, env);
    await env.DB.prepare("DELETE FROM approved_moderators WHERE user_id = ?").bind(revokeMatch[1]).run();
    await writeAudit(env, "🔒 " + owner.user.name + " revoked dashboard access for Discord user " + revokeMatch[1] + ".");
    return json({ ok: true });
  }

  if (request.method === "POST" && url.pathname === "/api/erlc/key") {
    const owner = await requireOwner(request, env);
    const body = await request.json().catch(() => ({}));
    const key = String(body.server_key || "").trim();
    if (!key) throw new HttpError(400, "Paste your ER:LC private-server API key first.");
    if (key.length > 512 || /[\r\n\u0000-\u001f]/.test(key)) throw new HttpError(400, "That does not look like a valid single-line API key.");
    const server = await erlcRequest(env, "/v2/server", {}, key);
    const encrypted = await encryptServerKey(env, key);
    await env.DB.prepare("INSERT INTO private_settings (key, value, updated_at) VALUES ('ERLC_SERVER_KEY', ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at").bind(encrypted, Date.now()).run();
    await writeAudit(env, "🔌 " + owner.user.name + " connected the ER:LC server API.");
    return json({ connected: true, server: serverSummary(server) });
  }

  if (request.method === "GET" && url.pathname === "/api/health") {
    await requireAccess(request, env);
    return json({ connected: true, server: serverSummary(await erlcRequest(env, "/v2/server")) });
  }
  if (request.method === "GET" && url.pathname === "/api/players") {
    await requireAccess(request, env);
    return json({ players: normalizePlayers(await erlcRequest(env, "/v1/server/players")) });
  }
  if (request.method === "GET" && url.pathname === "/api/bans") {
    await requireModerator(request, env);
    return json({ bans: normalizeBans(await erlcRequest(env, "/v1/server/bans")) });
  }
  if (request.method === "GET" && url.pathname === "/api/check-ban") {
    await requireModerator(request, env);
    const id = String(url.searchParams.get("roblox_id") || "").trim();
    if (!/^\d{1,20}$/.test(id)) throw new HttpError(400, "Enter a numeric Roblox user ID.");
    const found = normalizeBans(await erlcRequest(env, "/v1/server/bans")).find(row => row.id === id);
    return json({ banned: Boolean(found), message: found ? id + " is listed as " + found.name + "." : id + " is not on the current ban list." });
  }
  if (request.method === "POST" && url.pathname === "/api/command") {
    if (Number(request.headers.get("content-length") || 0) > 4096) throw new HttpError(413, "The request is too large.");
    const body = await request.json().catch(() => { throw new HttpError(400, "Invalid request body."); });
    const action = String(body.action || "");
    const actor = action === "ban" || action === "unban" ? await requireSenior(request, env) : await requireModerator(request, env);
    const id = String(body.roblox_id || "").trim();
    const reason = String(body.reason || "").trim();
    if (!["kick", "ban", "unban"].includes(action)) throw new HttpError(400, "Choose kick, ban, or unban.");
    if (!/^\d{1,20}$/.test(id)) throw new HttpError(400, "Enter a numeric Roblox user ID.");
    if (!reason || reason.length > 300 || /[\r\n\0;]/.test(reason)) throw new HttpError(400, "Enter a single-line reason between 1 and 300 characters, without semicolons.");
    if (body.confirmation !== true) throw new HttpError(400, "Review and confirm the action before sending.");
    if ((action === "ban" || action === "unban") && body.senior_ack !== true) throw new HttpError(403, "Ban and unban require senior moderation confirmation.");
    const now = Date.now();
    const cooldown = await env.DB.prepare("UPDATE command_cooldown SET last_at = ? WHERE id = 1 AND last_at <= ? RETURNING id").bind(now, now - 5000).first();
    if (!cooldown) throw new HttpError(429, "Wait a few seconds before sending another ER:LC command.");
    let command;
    let target = id;
    if (action === "kick") {
      const player = normalizePlayers(await erlcRequest(env, "/v1/server/players")).find(row => row.id === id);
      if (!player) throw new HttpError(404, "That Roblox ID is not currently in the server roster. Refresh players and check the ID.");
      target = player.name;
      command = ":kick " + player.name + " " + reason;
    } else if (action === "ban") command = ":ban " + id + " " + reason;
    else command = ":unban " + id;
    const details = "Roblox ID " + id + " • Reason: " + reason + " • Discord moderator: " + actor.user.name + " (" + actor.user.id + ")";
    if (!await writeAudit(env, "🟡 ER:LC action approved: **" + action + "** • " + details + ".")) throw new HttpError(503, "I couldn't write the action to #staff-logs, so I stopped without sending it.");
    try {
      await erlcRequest(env, "/v2/server/command", { method: "POST", body: JSON.stringify({ command }) });
    } catch (error) {
      await writeAudit(env, "❌ ER:LC action failed: **" + action + "** • " + details + " • " + safeMessage(error.message, env));
      throw error;
    }
    const logged = await writeAudit(env, "✅ ER:LC action completed: **" + action + "** • " + details + ".");
    return json({ ok: true, action, target, logged, message: "ER:LC accepted the " + action + " command for " + target + (logged ? ". The action was logged to #staff-logs." : ". The completion log could not be posted to #staff-logs.") });
  }
  throw new HttpError(404, "This dashboard route was not found.");
}

async function handleRequest(request, env) {
  const url = new URL(request.url);
  if (request.method === "OPTIONS") {
    const headers = corsHeaders(request, env);
    if (!headers["access-control-allow-origin"]) return new Response(null, { status: 403 });
    return new Response(null, { status: 204, headers });
  }
  const origin = request.headers.get("origin") || "";
  if (origin && !allowedOrigins(env).has(origin)) return json({ error: "This website origin is not allowed." }, 403);
  if (request.method === "GET" && url.pathname === "/health") {
    return json({ ok: true, service: "Potential Millionaires ER:LC API", ready: Boolean(env.DB && env.DISCORD_OAUTH_CLIENT_SECRET && env.DISCORD_BOT_TOKEN && env.ERLC_KEY_ENCRYPTION_SECRET) });
  }
  if (request.method === "GET" && url.pathname === "/auth/discord/url") return json(await createDiscordLoginUrl(request, env));
  if (request.method === "GET" && url.pathname === "/auth/discord/callback") return discordOAuthCallback(request, env);
  if (!url.pathname.startsWith("/api/")) return json({ error: "This backend serves API routes only. Open the GitHub Pages dashboard." }, 404);
  return handleApi(request, env, url);
}

export default {
  async fetch(request, env) {
    const headers = corsHeaders(request, env);
    let response;
    try { response = await handleRequest(request, env); }
    catch (error) {
      const status = Number(error && error.status) || 500;
      const message = safeMessage(error && error.message ? error.message : "Request failed.", env);
      response = json({ error: message }, status >= 400 && status < 600 ? status : 500);
    }
    const merged = new Headers(response.headers);
    for (const [key, value] of Object.entries(headers)) merged.set(key, value);
    merged.set("x-content-type-options", "nosniff");
    merged.set("referrer-policy", "same-origin");
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers: merged });
  },
};

