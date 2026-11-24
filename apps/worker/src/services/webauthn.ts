import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticationResponseJSON,
  type RegistrationResponseJSON,
} from "@simplewebauthn/server";
import { isoBase64URL } from "@simplewebauthn/server/helpers";
import { and, eq, gt, isNull, lte } from "drizzle-orm";
import { accounts, webauthnChallenges, webauthnCredentials } from "../db/schema";
import { BadRequestError, NotFoundError, nowIso, type ServiceContext } from "./context";
import { revealSecret } from "./secrets";
import { SECRET_FIELDS } from "../secrets/schemas";
import type { Env } from "../env";
import type { Identity } from "../auth/access-jwt";

const RP_NAME = "Bonus";
const CHALLENGE_TTL_MS = 5 * 60_000;

export class BiometricNotConfiguredError extends Error {
  constructor() {
    super("Set up device verification before revealing sensitive information");
    this.name = "BiometricNotConfiguredError";
  }
}

export class WebAuthnChallengeError extends BadRequestError {
  constructor() {
    super("WebAuthn challenge is missing, expired, or does not match this request");
    this.name = "WebAuthnChallengeError";
  }
}

function webauthnContext(request: Request) {
  const url = new URL(request.url);
  return { origin: url.origin, rpID: url.hostname };
}

async function requireAccount(ctx: ServiceContext, id: string) {
  const account = await ctx.db.select({ id: accounts.id, kind: accounts.kind }).from(accounts).where(and(eq(accounts.id, id), eq(accounts.ownerId, ctx.ownerId))).get();
  if (!account) throw new NotFoundError(`Account ${id}`);
  if (!SECRET_FIELDS[account.kind]) throw new BadRequestError("This account type does not support sensitive information");
  return account;
}

async function credentialsFor(ctx: ServiceContext) {
  return ctx.db.select().from(webauthnCredentials).where(eq(webauthnCredentials.ownerId, ctx.ownerId));
}

async function saveChallenge(ctx: ServiceContext, challenge: string, ceremony: "registration" | "authentication", accountId: string | null = null) {
  await ctx.db.delete(webauthnChallenges).where(and(eq(webauthnChallenges.ownerId, ctx.ownerId), lte(webauthnChallenges.expiresAt, nowIso())));
  await ctx.db.insert(webauthnChallenges).values({
    ownerId: ctx.ownerId,
    challenge,
    ceremony,
    accountId,
    expiresAt: new Date(Date.now() + CHALLENGE_TTL_MS).toISOString(),
  });
}

function challengeFromResponse(response: unknown) {
  const clientDataJSON = (response as RegistrationResponseJSON | AuthenticationResponseJSON | undefined)?.response?.clientDataJSON;
  if (typeof clientDataJSON !== "string") return null;
  try {
    const clientData = JSON.parse(new TextDecoder().decode(isoBase64URL.toBuffer(clientDataJSON))) as { challenge?: unknown };
    return typeof clientData.challenge === "string" ? clientData.challenge : null;
  } catch {
    return null;
  }
}

async function consumeChallenge(ctx: ServiceContext, response: unknown, ceremony: "registration" | "authentication", accountId: string | null = null) {
  const challenge = challengeFromResponse(response);
  if (!challenge) throw new WebAuthnChallengeError();
  const accountCondition = accountId === null ? isNull(webauthnChallenges.accountId) : eq(webauthnChallenges.accountId, accountId);
  const [row] = await ctx.db
    .delete(webauthnChallenges)
    .where(
      and(
        eq(webauthnChallenges.challenge, challenge),
        eq(webauthnChallenges.ownerId, ctx.ownerId),
        eq(webauthnChallenges.ceremony, ceremony),
        accountCondition,
        gt(webauthnChallenges.expiresAt, nowIso()),
      ),
    )
    .returning({ challenge: webauthnChallenges.challenge });
  if (!row) {
    throw new WebAuthnChallengeError();
  }
  return row.challenge;
}

export async function status(ctx: ServiceContext) {
  const credentials = await credentialsFor(ctx);
  return {
    configured: credentials.length > 0,
    credentials: credentials.map((credential) => ({
      id: credential.id,
      deviceType: credential.deviceType,
      backedUp: credential.backedUp,
      createdAt: credential.createdAt,
      lastUsedAt: credential.lastUsedAt,
    })),
  };
}

export async function registrationOptions(ctx: ServiceContext, request: Request) {
  const { rpID } = webauthnContext(request);
  const existing = await credentialsFor(ctx);
  const userID = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(ctx.ownerId)));
  const options = await generateRegistrationOptions({
    rpName: RP_NAME,
    rpID,
    userName: ctx.ownerId,
    userDisplayName: ctx.ownerId,
    userID,
    attestationType: "none",
    authenticatorSelection: { authenticatorAttachment: "platform", residentKey: "required", userVerification: "required" },
    preferredAuthenticatorType: "localDevice",
    excludeCredentials: existing.map((credential) => ({ id: credential.id, transports: credential.transports })),
  });
  await saveChallenge(ctx, options.challenge, "registration");
  return options;
}

export async function verifyRegistration(ctx: ServiceContext, request: Request, response: unknown) {
  const challenge = await consumeChallenge(ctx, response, "registration");
  const { origin, rpID } = webauthnContext(request);
  try {
    const result = await verifyRegistrationResponse({
      response: response as RegistrationResponseJSON,
      expectedChallenge: challenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      requireUserVerification: true,
    });
    if (!result.verified) throw new Error("not verified");
    const { credential, credentialDeviceType, credentialBackedUp } = result.registrationInfo;
    await ctx.db.insert(webauthnCredentials).values({
      id: credential.id,
      ownerId: ctx.ownerId,
      publicKey: isoBase64URL.fromBuffer(credential.publicKey),
      counter: credential.counter,
      transports: credential.transports ?? [],
      deviceType: credentialDeviceType,
      backedUp: credentialBackedUp,
    });
    return status(ctx);
  } catch {
    throw new BadRequestError("Device verification registration failed");
  }
}

export async function deleteCredential(ctx: ServiceContext, id: string) {
  const [deleted] = await ctx.db
    .delete(webauthnCredentials)
    .where(and(eq(webauthnCredentials.id, id), eq(webauthnCredentials.ownerId, ctx.ownerId)))
    .returning({ id: webauthnCredentials.id });
  if (!deleted) throw new NotFoundError(`WebAuthn credential ${id}`);
  return status(ctx);
}

export async function authenticationOptions(ctx: ServiceContext, request: Request, accountId: string) {
  await requireAccount(ctx, accountId);
  const credentials = await credentialsFor(ctx);
  if (credentials.length === 0) throw new BiometricNotConfiguredError();
  const { rpID } = webauthnContext(request);
  const options = await generateAuthenticationOptions({
    rpID,
    userVerification: "required",
    allowCredentials: credentials.map((credential) => ({ id: credential.id, transports: credential.transports })),
  });
  await saveChallenge(ctx, options.challenge, "authentication", accountId);
  return options;
}

export async function authenticateAndReveal(ctx: ServiceContext, env: Env, request: Request, accountId: string, identity: Identity, response: unknown) {
  await requireAccount(ctx, accountId);
  const challenge = await consumeChallenge(ctx, response, "authentication", accountId);
  const credentialId = (response as AuthenticationResponseJSON | undefined)?.id;
  const stored = credentialId
    ? await ctx.db
        .select()
        .from(webauthnCredentials)
        .where(and(eq(webauthnCredentials.id, credentialId), eq(webauthnCredentials.ownerId, ctx.ownerId)))
        .get()
    : undefined;
  if (!stored) throw new BadRequestError("Device verification failed");
  const { origin, rpID } = webauthnContext(request);
  try {
    const result = await verifyAuthenticationResponse({
      response: response as AuthenticationResponseJSON,
      expectedChallenge: challenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      requireUserVerification: true,
      credential: {
        id: stored.id,
        publicKey: isoBase64URL.toBuffer(stored.publicKey),
        counter: stored.counter,
        transports: stored.transports,
      },
    });
    if (!result.verified || !result.authenticationInfo.userVerified) throw new Error("not verified");
    await ctx.db
      .update(webauthnCredentials)
      .set({ counter: result.authenticationInfo.newCounter, lastUsedAt: nowIso() })
      .where(eq(webauthnCredentials.id, stored.id));
    return revealSecret(ctx, env, accountId, identity);
  } catch {
    throw new BadRequestError("Device verification failed");
  }
}
