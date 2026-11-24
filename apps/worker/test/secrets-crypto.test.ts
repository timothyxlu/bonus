import { describe, expect, it } from "vitest";
import { b64, decodeKey, decryptPayload, DecryptError, encryptPayload, loadKeyring } from "../src/secrets/crypto";
import { luhnValid, parseSecretPatch, trailingDigits, trailingGiftCharacters } from "../src/secrets/schemas";
import { isRecentLogin } from "../src/services/secrets";

const key = (fill: number) => b64.encode(new Uint8Array(32).fill(fill));
const ctx = { ownerId: "o@example.com", accountId: "acc-1", kind: "credit_card" };
const payload = { pan: "4111111111111111", exp: "12/30", cvv: "123" };

describe("secret encryption", () => {
  it("validates the key: missing, invalid, wrong length", async () => {
    expect((await loadKeyring({})).status).toBe("missing");
    expect((await loadKeyring({ CARD_ENCRYPTION_KEY: "not base64 !!" })).status).toBe("invalid");
    expect((await loadKeyring({ CARD_ENCRYPTION_KEY: b64.encode(new Uint8Array(16)) })).status).toBe("invalid");
    expect(decodeKey(key(1))?.length).toBe(32);
    const ring = await loadKeyring({ CARD_ENCRYPTION_KEY: key(1) });
    expect(ring.status).toBe("ok");
    await expect(encryptPayload(await loadKeyring({}), payload, ctx)).rejects.toThrow(/not set/);
  });

  it("round-trips with a fresh random IV each time, never containing plaintext", async () => {
    const ring = await loadKeyring({ CARD_ENCRYPTION_KEY: key(2) });
    const a = await encryptPayload(ring, payload, ctx);
    const b = await encryptPayload(ring, payload, ctx);
    expect(a.iv).not.toBe(b.iv);
    expect(a.ciphertext).not.toBe(b.ciphertext);
    expect(b64.decode(a.iv)!.length).toBe(12);
    expect(JSON.stringify(a)).not.toContain("4111");
    expect(a).toMatchObject({ version: 1, keyId: "k1" });
    expect(await decryptPayload(ring, a, ctx)).toEqual(payload);
  });

  it("AAD binds the value to owner, account and kind; tampering fails", async () => {
    const ring = await loadKeyring({ CARD_ENCRYPTION_KEY: key(3) });
    const env = await encryptPayload(ring, payload, ctx);
    await expect(decryptPayload(ring, env, { ...ctx, accountId: "acc-2" })).rejects.toBeInstanceOf(DecryptError);
    await expect(decryptPayload(ring, env, { ...ctx, ownerId: "x@example.com" })).rejects.toBeInstanceOf(DecryptError);
    await expect(decryptPayload(ring, env, { ...ctx, kind: "gift_card" })).rejects.toBeInstanceOf(DecryptError);
    const bytes = b64.decode(env.ciphertext)!;
    bytes[0] = bytes[0]! ^ 1;
    await expect(decryptPayload(ring, { ...env, ciphertext: b64.encode(bytes) }, ctx)).rejects.toBeInstanceOf(DecryptError);
    const other = await loadKeyring({ CARD_ENCRYPTION_KEY: key(4) });
    await expect(decryptPayload(other, env, ctx)).rejects.toThrow(/not configured|decrypt/);
  });

  it("rotation: old keys still decrypt, new values use the current key id", async () => {
    const old = await loadKeyring({ CARD_ENCRYPTION_KEY: key(5), CARD_ENCRYPTION_KEY_ID: "k1" });
    const env = await encryptPayload(old, payload, ctx);
    const rotated = await loadKeyring({ CARD_ENCRYPTION_KEY: key(6), CARD_ENCRYPTION_KEY_ID: "k2", CARD_ENCRYPTION_KEYS_OLD: `k1:${key(5)}` });
    expect(await decryptPayload(rotated, env, ctx)).toEqual(payload);
    expect((await encryptPayload(rotated, payload, ctx)).keyId).toBe("k2");
  });
});

describe("secret validation", () => {
  it("Luhn, expiry, CVV, gift card fields; errors never echo values", () => {
    expect(luhnValid("4111111111111111")).toBe(true);
    expect(luhnValid("4111111111111112")).toBe(false);
    const bad = parseSecretPatch("credit_card", { pan: "4111 1111 1111 1112", exp: "13/30", cvv: "12" });
    expect(bad.ok).toBe(false);
    if (!bad.ok) {
      expect(bad.error).toMatch(/Luhn/);
      expect(bad.error).not.toContain("1112");
    }
    const ok = parseSecretPatch("credit_card", { pan: "4111-1111-1111-1111", exp: "01/29", cvv: null });
    expect(ok.ok && ok.data.pan).toBe("4111111111111111");
    expect(parseSecretPatch("credit_card", { pin: "1" }).ok).toBe(false);
    expect(parseSecretPatch("gift_card", { number: "ABCD-1234", pin: "9876" }).ok).toBe(true);
    expect(parseSecretPatch("bank_account", { pan: "x" }).ok).toBe(false);
    expect(trailingDigits("378282246310005")).toBe("10005");
    expect(trailingDigits("4111111111111111")).toBe("1111");
    expect(trailingGiftCharacters("GIFT-7777-8888")).toBe("8888");
  });

  it("recent-login window", () => {
    const now = 1_800_000_000;
    expect(isRecentLogin({ iat: now - 60 }, now)).toBe(true);
    expect(isRecentLogin({ iat: now - 16 * 60 }, now)).toBe(false);
    expect(isRecentLogin({}, now)).toBe(false);
  });
});
