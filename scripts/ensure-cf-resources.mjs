#!/usr/bin/env node
/**
 * CI helper: look up (or create) the D1 database and KV namespace by name and
 * write their IDs into apps/worker/wrangler.jsonc (in the CI checkout only).
 * Requires CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID in the environment.
 */
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const WORKER_DIR = resolve(import.meta.dirname, "../apps/worker");
const CONFIG = resolve(WORKER_DIR, "wrangler.jsonc");
const D1_NAME = process.env.D1_NAME ?? "bonus";
const KV_TITLE = process.env.KV_TITLE ?? "bonus-oauth";
const D1_PLACEHOLDER = "00000000-0000-0000-0000-000000000000";
const KV_PLACEHOLDER = "00000000000000000000000000000000";

const wrangler = (...args) =>
  execFileSync("npx", ["wrangler", ...args], { cwd: WORKER_DIR, encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] });

function parseJsonOutput(out) {
  const start = out.search(/[[{]/);
  return JSON.parse(out.slice(start));
}

function d1Id() {
  const find = () => parseJsonOutput(wrangler("d1", "list", "--json")).find((d) => d.name === D1_NAME);
  let db = find();
  if (!db) {
    console.log(`Creating D1 database "${D1_NAME}"...`);
    wrangler("d1", "create", D1_NAME);
    db = find();
  }
  if (!db) throw new Error("Could not find or create the D1 database");
  return db.uuid;
}

function kvId() {
  const find = () => parseJsonOutput(wrangler("kv", "namespace", "list")).find((n) => n.title === KV_TITLE);
  let ns = find();
  if (!ns) {
    console.log(`Creating KV namespace "${KV_TITLE}"...`);
    wrangler("kv", "namespace", "create", KV_TITLE);
    ns = find();
  }
  if (!ns) throw new Error("Could not find or create the KV namespace");
  return ns.id;
}

const d1 = d1Id();
const kv = kvId();
let config = readFileSync(CONFIG, "utf8");
config = config.replace(D1_PLACEHOLDER, d1).replace(KV_PLACEHOLDER, kv);
writeFileSync(CONFIG, config);
console.log(`D1 ${D1_NAME}=${d1}, KV ${KV_TITLE}=${kv} written to wrangler.jsonc`);
