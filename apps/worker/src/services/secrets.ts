/**
 * Account secrets (full card number / expiry / CVV, gift card number / PIN).
 * Web-only: nothing here is reachable from MCP, list endpoints or import/export.
 */
import { and, eq, gte, sql } from "drizzle-orm";
import type { Identity } from "../auth/access-jwt";
import { accounts, accountSecrets, secretAudit } from "../db/schema";
import type { Env } from "../env";
import { decryptPayload, encryptPayload, loadKeyring, SecretsUnavailableError } from "../secrets/crypto";
import { parseSecretPatch, SECRET_FIELDS, trailingDigits } from "../secrets/schemas";
import { BadRequestError, NotFoundError, newId, nowIso, type ServiceContext } from "./context";

/** A reveal needs an Access login at most this old. */
export const REVEAL_MAX_LOGIN_AGE_SEC = 15 * 60;
/** At most this many reveals per owner per window. */
export const REVEAL_LIMIT = 10;
export const REVEAL_WINDOW_MIN = 10;

export class ReauthRequiredError extends Error {
  constructor() {
    super("Please sign in again to reveal card details (login must be within the last 15 minutes)");
    this.name = "ReauthRequiredError";
  }
}
export class RateLimitedError extends Error {
  constructor() {
    super(`Too many reveals; try again in a few minutes`);
    this.name = "RateLimitedError";
  }
}

async function requireAccount(ctx: ServiceContext, id: string) {
  const row = await ctx.db.select().from(accounts).where(and(eq(accounts.id, id), eq(accounts.ownerId, ctx.ownerId))).get();
  if (!row) throw new NotFoundError(`Account ${id}`);
  return row;
}

async function audit(ctx: ServiceContext, accountId: string, action: (typeof secretAudit.$inferInsert)["action"]) {
  await ctx.db.insert(secretAudit).values({ id: newId(), ownerId: ctx.ownerId, accountId, action, actor: ctx.ownerId });
}

export async function secretsStatus(env: Env) {
  const ring = await loadKeyring(env);
  return { keyStatus: ring.status, keyId: ring.status === "ok" ? ring.currentId : null, kinds: SECRET_FIELDS };
}

/** Field names only - never values. */
export async function getSecretMeta(ctx: ServiceContext, env: Env, accountId: string) {
  const account = await requireAccount(ctx, accountId);
  const ring = await loadKeyring(env);
  const row = await ctx.db.select({ fields: accountSecrets.fields, updatedAt: accountSecrets.updatedAt, keyId: accountSecrets.keyId }).from(accountSecrets).where(eq(accountSecrets.accountId, accountId)).get();
  return {
    keyStatus: ring.status,
    supported: !!SECRET_FIELDS[account.kind],
    fieldNames: SECRET_FIELDS[account.kind] ?? [],
    stored: row?.fields ?? [],
    updatedAt: row?.updatedAt ?? null,
    needsRotation: !!row && ring.status === "ok" && row.keyId !== ring.currentId,
  };
}

async function readExisting(ctx: ServiceContext, env: Env, account: { id: string; kind: string }) {
  const row = await ctx.db.select().from(accountSecrets).where(eq(accountSecrets.accountId, account.id)).get();
  if (!row) return {};
  const ring = await loadKeyring(env);
  return decryptPayload(ring, row, { ownerId: ctx.ownerId, accountId: account.id, kind: row.kind });
}

export async function writeSecret(ctx: ServiceContext, env: Env, accountId: string, body: unknown) {
  const account = await requireAccount(ctx, accountId);
  const parsed = parseSecretPatch(account.kind, body);
  if (!parsed.ok) throw new BadRequestError(parsed.error);
  const ring = await loadKeyring(env);
  if (ring.status !== "ok") throw new SecretsUnavailableError(ring.status);

  const merged: Record<string, string> = { ...(await readExisting(ctx, env, account)) };
  for (const [k, v] of Object.entries(parsed.data)) {
    if (v === null) delete merged[k];
    else if (v !== undefined) merged[k] = v;
  }
  const fields = Object.keys(merged).sort();
  if (fields.length === 0) return deleteSecret(ctx, accountId);

  const env2 = await encryptPayload(ring, merged, { ownerId: ctx.ownerId, accountId, kind: account.kind });
  const stmts: any[] = [
    ctx.db
      .insert(accountSecrets)
      .values({ accountId, ownerId: ctx.ownerId, kind: account.kind, ...env2, fields })
      .onConflictDoUpdate({ target: accountSecrets.accountId, set: { ...env2, kind: account.kind, fields, updatedAt: nowIso() } }),
  ];
  // Keep the visible trailing digits in sync with the stored card number.
  if (account.kind === "credit_card" && typeof parsed.data.pan === "string") {
    stmts.push(ctx.db.update(accounts).set({ last4: trailingDigits(merged.pan!), updatedAt: nowIso() }).where(eq(accounts.id, accountId)));
  }
  stmts.push(ctx.db.insert(secretAudit).values({ id: newId(), ownerId: ctx.ownerId, accountId, action: "write", actor: ctx.ownerId }));
  await ctx.db.batch(stmts as [any, ...any[]]);
  return getSecretMeta(ctx, env, accountId);
}

export function isRecentLogin(identity: Pick<Identity, "iat">, nowSec = Math.floor(Date.now() / 1000)) {
  return typeof identity.iat === "number" && nowSec - identity.iat <= REVEAL_MAX_LOGIN_AGE_SEC && identity.iat <= nowSec + 60;
}

export async function revealSecret(ctx: ServiceContext, env: Env, accountId: string, identity: Identity) {
  const account = await requireAccount(ctx, accountId);
  if (!isRecentLogin(identity)) {
    await audit(ctx, accountId, "reveal_denied");
    throw new ReauthRequiredError();
  }
  const since = new Date(Date.now() - REVEAL_WINDOW_MIN * 60_000).toISOString();
  const [row] = await ctx.db
    .select({ n: sql<number>`count(*)` })
    .from(secretAudit)
    .where(and(eq(secretAudit.ownerId, ctx.ownerId), eq(secretAudit.action, "reveal"), gte(secretAudit.at, since)));
  if ((row?.n ?? 0) >= REVEAL_LIMIT) throw new RateLimitedError();
  const ring = await loadKeyring(env);
  if (ring.status !== "ok") throw new SecretsUnavailableError(ring.status);
  const values = await readExisting(ctx, env, account);
  await audit(ctx, accountId, "reveal");
  return { values, revealSeconds: 30 };
}

export async function deleteSecret(ctx: ServiceContext, accountId: string) {
  await requireAccount(ctx, accountId);
  await ctx.db.batch([
    ctx.db.delete(accountSecrets).where(and(eq(accountSecrets.accountId, accountId), eq(accountSecrets.ownerId, ctx.ownerId))),
    ctx.db.insert(secretAudit).values({ id: newId(), ownerId: ctx.ownerId, accountId, action: "delete", actor: ctx.ownerId }),
  ]);
  return { deleted: true };
}

/** Re-encrypt the owner's secrets that use an old key with the current key. */
export async function rotateSecrets(ctx: ServiceContext, env: Env) {
  const ring = await loadKeyring(env);
  if (ring.status !== "ok") throw new SecretsUnavailableError(ring.status);
  const rows = await ctx.db.select().from(accountSecrets).where(eq(accountSecrets.ownerId, ctx.ownerId));
  let rotated = 0;
  for (const r of rows) {
    if (r.keyId === ring.currentId) continue;
    const aadCtx = { ownerId: ctx.ownerId, accountId: r.accountId, kind: r.kind };
    const values = await decryptPayload(ring, r, aadCtx);
    const next = await encryptPayload(ring, values, aadCtx);
    await ctx.db.update(accountSecrets).set({ ...next, updatedAt: nowIso() }).where(eq(accountSecrets.accountId, r.accountId));
    await audit(ctx, r.accountId, "rotate");
    rotated++;
  }
  return { rotated, total: rows.length, keyId: ring.currentId };
}
