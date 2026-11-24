/**
 * Field-level encryption for account secrets: AES-256-GCM via WebCrypto.
 * - random 96-bit IV per value
 * - AAD binds the ciphertext to owner + account + kind (no swapping between rows)
 * - key id stored with each value; old keys can be supplied for rotation
 * Never falls back to plaintext. Never logs or echoes key material or values.
 */
import type { Env } from "../env";

export const ENVELOPE_VERSION = 1;

export type KeyStatus = "ok" | "missing" | "invalid";

export interface Keyring {
  status: KeyStatus;
  currentId: string;
  keys: Map<string, CryptoKey>;
}

export class SecretsUnavailableError extends Error {
  constructor(public status: Exclude<KeyStatus, "ok">) {
    super(status === "missing" ? "Card secrets are disabled: CARD_ENCRYPTION_KEY is not set" : "Card secrets are disabled: CARD_ENCRYPTION_KEY is invalid (must be 32 random bytes, base64)");
    this.name = "SecretsUnavailableError";
  }
}

export class DecryptError extends Error {
  constructor(message = "Could not decrypt the stored secret") {
    super(message);
    this.name = "DecryptError";
  }
}

const b64 = {
  encode(bytes: Uint8Array) {
    let s = "";
    for (const b of bytes) s += String.fromCharCode(b);
    return btoa(s);
  },
  decode(text: string): Uint8Array | null {
    try {
      const bin = atob(text.trim());
      return Uint8Array.from(bin, (c) => c.charCodeAt(0));
    } catch {
      return null;
    }
  },
};
export { b64 };

async function importKey(raw: Uint8Array) {
  return crypto.subtle.importKey("raw", raw, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

/** Decode and validate a base64 key: exactly 32 bytes. */
export function decodeKey(text: string | undefined): Uint8Array | null {
  if (!text) return null;
  const raw = b64.decode(text);
  return raw && raw.length === 32 ? raw : null;
}

const cache = new Map<string, Promise<Keyring>>();

export function loadKeyring(env: Pick<Env, "CARD_ENCRYPTION_KEY" | "CARD_ENCRYPTION_KEY_ID" | "CARD_ENCRYPTION_KEYS_OLD">): Promise<Keyring> {
  const cacheKey = `${env.CARD_ENCRYPTION_KEY ?? ""}|${env.CARD_ENCRYPTION_KEY_ID ?? ""}|${env.CARD_ENCRYPTION_KEYS_OLD ?? ""}`;
  let p = cache.get(cacheKey);
  if (!p) {
    p = (async (): Promise<Keyring> => {
      const currentId = (env.CARD_ENCRYPTION_KEY_ID || "k1").trim();
      const keys = new Map<string, CryptoKey>();
      if (!env.CARD_ENCRYPTION_KEY) return { status: "missing", currentId, keys };
      const raw = decodeKey(env.CARD_ENCRYPTION_KEY);
      if (!raw) return { status: "invalid", currentId, keys };
      keys.set(currentId, await importKey(raw));
      for (const part of (env.CARD_ENCRYPTION_KEYS_OLD ?? "").split(",")) {
        const [kid, value] = part.split(":");
        const old = decodeKey(value);
        if (kid?.trim() && old && !keys.has(kid.trim())) keys.set(kid.trim(), await importKey(old));
      }
      return { status: "ok", currentId, keys };
    })();
    cache.set(cacheKey, p);
  }
  return p;
}

export interface Envelope {
  version: number;
  keyId: string;
  iv: string;
  ciphertext: string;
}

export interface AadContext {
  ownerId: string;
  accountId: string;
  kind: string;
}

const aad = (c: AadContext) => new TextEncoder().encode(`bonus-secret:v${ENVELOPE_VERSION}:${c.ownerId}:${c.accountId}:${c.kind}`);

export async function encryptPayload(ring: Keyring, payload: Record<string, string>, ctx: AadContext): Promise<Envelope> {
  if (ring.status !== "ok") throw new SecretsUnavailableError(ring.status);
  const key = ring.keys.get(ring.currentId)!;
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: aad(ctx), tagLength: 128 }, key, new TextEncoder().encode(JSON.stringify(payload)));
  return { version: ENVELOPE_VERSION, keyId: ring.currentId, iv: b64.encode(iv), ciphertext: b64.encode(new Uint8Array(ct)) };
}

export async function decryptPayload(ring: Keyring, env: Envelope, ctx: AadContext): Promise<Record<string, string>> {
  if (ring.status !== "ok") throw new SecretsUnavailableError(ring.status);
  if (env.version !== ENVELOPE_VERSION) throw new DecryptError(`Unsupported secret format v${env.version}`);
  const key = ring.keys.get(env.keyId);
  if (!key) throw new DecryptError(`Encryption key "${env.keyId}" is not configured (add it to CARD_ENCRYPTION_KEYS_OLD)`);
  const iv = b64.decode(env.iv);
  const ct = b64.decode(env.ciphertext);
  if (!iv || !ct) throw new DecryptError();
  try {
    const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv, additionalData: aad(ctx), tagLength: 128 }, key, ct);
    return JSON.parse(new TextDecoder().decode(pt)) as Record<string, string>;
  } catch {
    // Deliberately generic: wrong key, tampering or AAD mismatch all look the same.
    throw new DecryptError();
  }
}
