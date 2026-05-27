import fs from "node:fs/promises";
import path from "node:path";

const baseUrl = process.env.SMOKE_BASE_URL || process.argv[2] || "http://localhost:8080";
const configPath = process.env.SMOKE_CONFIG || path.resolve("tests", "smoke.config.example.json");

async function request(check) {
  const url = new URL(check.path, baseUrl).toString();
  const options = {
    method: check.method || "GET",
    headers: check.headers || {}
  };
  if (check.body) {
    options.headers["content-type"] = options.headers["content-type"] || "application/json; charset=utf-8";
    options.body = JSON.stringify(check.body);
  }
  const response = await fetch(url, options);
  const text = await response.text();
  const expected = check.expectedStatus || [200];
  if (!expected.includes(response.status)) {
    throw new Error(`${check.name} expected ${expected.join(",")} got ${response.status}`);
  }
  if (!check.allowEmptyBody && !text.trim()) {
    throw new Error(`${check.name} returned empty body`);
  }
  for (const required of check.requiredText || []) {
    if (!text.includes(required)) throw new Error(`${check.name} missing required text: ${required}`);
  }
  for (const forbidden of check.forbiddenText || []) {
    if (text.includes(forbidden)) throw new Error(`${check.name} contains forbidden text: ${forbidden}`);
  }
  return { name: check.name, status: response.status };
}

async function waitForHealth(health) {
  const attempts = Number(process.env.SMOKE_RETRIES || 12);
  const delayMs = Number(process.env.SMOKE_RETRY_DELAY_MS || 3000);
  let lastError;
  for (let i = 0; i < attempts; i += 1) {
    try {
      return await request({ name: "health", ...(health || { path: "/health" }) });
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  throw lastError;
}

const raw = await fs.readFile(configPath, "utf8");
const config = JSON.parse(raw);
const results = [];

results.push(await waitForHealth(config.health));
for (const check of config.ui || []) results.push(await request(check));
for (const check of config.api || []) results.push(await request(check));

console.table(results);
console.log(`MVP smoke passed: ${results.length} checks against ${baseUrl}`);
