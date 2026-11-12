import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const apiToken = String(process.env.CLOUDFLARE_API_TOKEN || "").trim();
const accountId = String(process.env.CLOUDFLARE_ACCOUNT_ID || "").trim();
if (!apiToken || !accountId) throw new Error("Set CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID in GitHub Actions secrets.");

const databaseName = "potential-millionaires-erlc";
const apiBase = "https://api.cloudflare.com/client/v4";
const headers = {
  authorization: "Bearer " + apiToken,
  accept: "application/json",
  "content-type": "application/json",
};

async function cloudflare(pathname, options = {}) {
  const response = await fetch(apiBase + pathname, {
    ...options,
    headers: { ...headers, ...(options.headers || {}) },
    signal: AbortSignal.timeout(20000),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.success === false) {
    const detail = Array.isArray(payload.errors)
      ? payload.errors.map(item => String(item.message || item.code || "Cloudflare API error")).join("; ")
      : "Cloudflare API request failed.";
    throw new Error(("Cloudflare API HTTP " + response.status + ": " + detail).split(apiToken).join("[redacted]"));
  }
  return payload;
}

let database = null;
for (let page = 1; page <= 20; page += 1) {
  const result = await cloudflare(
    "/accounts/" + encodeURIComponent(accountId) + "/d1/database?per_page=100&page=" + page,
  );
  const databases = Array.isArray(result.result) ? result.result : [];
  database = databases.find(item => item && item.name === databaseName) || null;
  if (database) break;
  const totalPages = Number(result.result_info && result.result_info.total_pages) || 1;
  if (page >= totalPages) break;
}
if (!database) {
  const created = await cloudflare(
    "/accounts/" + encodeURIComponent(accountId) + "/d1/database",
    { method: "POST", body: JSON.stringify({ name: databaseName }) },
  );
  database = created.result;
}
const databaseId = String(database && (database.uuid || database.id) || "");
if (!/^[a-f0-9-]{32,36}$/i.test(databaseId)) throw new Error("Cloudflare did not return a valid D1 database ID.");

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const configPath = path.resolve(scriptDir, "../wrangler.toml");
const config = await readFile(configPath, "utf8");
const databaseIdLine = /^database_id[ \t]*=[ \t]*"[^"]*"[ \t]*$/m;
if (!databaseIdLine.test(config)) throw new Error("Could not find database_id in worker/wrangler.toml.");
const updated = config.replace(databaseIdLine, 'database_id = "' + databaseId + '"');
await writeFile(configPath, updated, "utf8");

if (process.env.GITHUB_OUTPUT) {
  await writeFile(process.env.GITHUB_OUTPUT, "database_id=" + databaseId + "\n", { flag: "a" });
}
console.log("D1 database is ready and Wrangler configuration has been prepared.");
