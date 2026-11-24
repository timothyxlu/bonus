import type { AccountKind } from "@bonus/core";
import { z } from "zod";

/** Luhn checksum for card numbers. */
export function luhnValid(digits: string): boolean {
  let sum = 0;
  let double = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = digits.charCodeAt(i) - 48;
    if (d < 0 || d > 9) return false;
    if (double) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    double = !double;
  }
  return digits.length > 0 && sum % 10 === 0;
}

// Messages never echo the input value.
const pan = z
  .string()
  .transform((s) => s.replace(/[\s-]/g, ""))
  .refine((s) => /^\d{12,19}$/.test(s), { message: "Card number must be 12-19 digits" })
  .refine(luhnValid, { message: "Card number fails the Luhn check" });
const exp = z
  .string()
  .trim()
  .regex(/^(0[1-9]|1[0-2])\/\d{2}$/, { message: "Expiry must be MM/YY" });
const cvv = z
  .string()
  .trim()
  .regex(/^\d{3,4}$/, { message: "CVV must be 3 or 4 digits" });
const giftNumber = z
  .string()
  .trim()
  .regex(/^[A-Za-z0-9 -]{4,40}$/, { message: "Gift card number must be 4-40 letters, digits, spaces or dashes" });
const pin = z
  .string()
  .trim()
  .regex(/^[A-Za-z0-9]{1,16}$/, { message: "PIN must be 1-16 letters or digits" });

/** Per-kind secret fields. Add a kind here to support it (UI reads SECRET_FIELDS from the meta endpoint). */
export const SECRET_FIELDS: Partial<Record<AccountKind, readonly string[]>> = {
  credit_card: ["pan", "exp", "cvv"],
  gift_card: ["number", "pin"],
};

const patchSchemas: Partial<Record<AccountKind, z.ZodType<Record<string, string | null | undefined>>>> = {
  credit_card: z.object({ pan: pan.nullish(), exp: exp.nullish(), cvv: cvv.nullish() }).strict(),
  gift_card: z.object({ number: giftNumber.nullish(), pin: pin.nullish() }).strict(),
};

/** A write: a value sets the field, null removes it, absent keeps it. */
export function parseSecretPatch(kind: AccountKind, body: unknown): { ok: true; data: Record<string, string | null | undefined> } | { ok: false; error: string } {
  const schema = patchSchemas[kind];
  if (!schema) return { ok: false, error: `Secrets are not supported for ${kind} accounts` };
  const r = schema.safeParse(body);
  if (!r.success) return { ok: false, error: r.error.issues.map((i) => `${i.path.join(".") || "body"}: ${i.code === "unrecognized_keys" ? "unknown field" : i.message}`).join("; ") };
  return { ok: true, data: r.data };
}

/** Trailing digits to keep on the account: 5 for 15-digit Amex numbers (34/37), else 4. */
export function trailingDigits(panDigits: string) {
  return panDigits.length === 15 && /^3[47]/.test(panDigits) ? panDigits.slice(-5) : panDigits.slice(-4);
}

export function trailingGiftCharacters(number: string) {
  return number.replace(/[\s-]/g, "").slice(-4);
}
