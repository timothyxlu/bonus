import { benefitStatus, bonusProgress, type EventType } from "@bonus/core";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import type { z } from "zod";
import {
  accountSecrets,
  accounts,
  benefits,
  benefitUses,
  bonuses,
  events,
  institutions,
  products,
  type Account,
  type Benefit,
  type BenefitUse,
  type Bonus,
  type Institution,
  type Product,
} from "../db/schema";
import type { accountInput, accountPatch, eventInput } from "../schemas";
import { catalogView, ensureCatalog, getActiveProduct } from "./catalog";
import { BadRequestError, NotFoundError, newId, nowIso, type ServiceContext } from "./context";

export interface AccountSummary extends Account {
  productName: string | null;
  institutionId: string | null;
  institutionName: string | null;
  family: string | null;
  annualFee: number | null;
  network: string | null;
  currency: string | null;
  label: string;
  activeBonus: (Bonus & ReturnType<typeof bonusProgress>) | null;
  unusedBenefits: number;
  benefitCount: number;
}

export function accountLabel(a: Pick<Account, "nickname" | "last4">, productName?: string | null) {
  const base = a.nickname || productName || "Account";
  return a.last4 ? `${base} ••${a.last4}` : base;
}

type Joined = { account: Account; product: Product | null; institution: Institution | null };

async function loadJoined(ctx: ServiceContext, where?: ReturnType<typeof eq>) {
  const rows = await ctx.db
    .select({ account: accounts, product: products, institution: institutions })
    .from(accounts)
    .leftJoin(products, eq(accounts.productId, products.id))
    .leftJoin(
      institutions,
      // Prefer the product's institution, fall back to the account's own.
      eq(institutions.id, products.institutionId),
    )
    .where(and(eq(accounts.ownerId, ctx.ownerId), where))
    .orderBy(desc(accounts.openedAt), desc(accounts.createdAt));
  // Apply the owner's catalog view (overrides of seeded products/institutions).
  const view = await catalogView(ctx);
  for (const r of rows) {
    if (r.product) r.product = view.products.get(r.product.id) ?? r.product;
    if (r.institution) r.institution = view.institutions.get(r.institution.id) ?? r.institution;
  }
  // Fill institution for product-less accounts.
  const missing = rows.filter((r) => !r.institution && r.account.institutionId).map((r) => r.account.institutionId!);
  if (missing.length) {
    const inst = await ctx.db.select().from(institutions).where(inArray(institutions.id, [...new Set(missing)]));
    const byId = new Map(inst.map((i) => [i.id, i]));
    for (const r of rows)
      if (!r.institution && r.account.institutionId)
        r.institution = view.institutions.get(r.account.institutionId) ?? byId.get(r.account.institutionId) ?? null;
  }
  return rows as Joined[];
}

function summarize(
  r: Joined,
  bonusRows: Bonus[],
  benefitRows: Benefit[],
  useRows: BenefitUse[],
  today: string,
): AccountSummary {
  const a = r.account;
  const active = bonusRows
    .filter((b) => b.accountId === a.id && b.status === "in_progress")
    .sort((x, y) => (x.deadline ?? "9999") < (y.deadline ?? "9999") ? -1 : 1)[0];
  const bens = benefitRows.filter((b) => b.accountId === a.id && b.active);
  const unused =
    a.status === "open"
      ? bens.filter((b) =>
          benefitStatus(b, useRows.filter((u) => u.benefitId === b.id), today, a.openedAt).unused,
        ).length
      : 0;
  return {
    ...a,
    productName: r.product?.name ?? null,
    institutionId: r.institution?.id ?? a.institutionId,
    institutionName: r.institution?.name ?? null,
    family: r.product?.family ?? null,
    annualFee: r.product?.annualFee ?? null,
    network: r.product?.network ?? null,
    currency: r.product?.currency ?? null,
    label: accountLabel(a, r.product?.name),
    activeBonus: active ? { ...active, ...bonusProgress(active, today) } : null,
    unusedBenefits: unused,
    benefitCount: bens.length,
  };
}

export interface AccountFilter {
  kind?: string;
  status?: string;
  institutionId?: string;
  q?: string;
}

export async function listAccounts(ctx: ServiceContext, filter: AccountFilter = {}): Promise<AccountSummary[]> {
  const rows = await loadJoined(ctx);
  const [bonusRows, benefitRows, useRows] = await Promise.all([
    ctx.db.select().from(bonuses).where(eq(bonuses.ownerId, ctx.ownerId)),
    ctx.db.select().from(benefits).where(eq(benefits.ownerId, ctx.ownerId)),
    ctx.db.select().from(benefitUses).where(eq(benefitUses.ownerId, ctx.ownerId)),
  ]);
  const q = filter.q?.toLowerCase().trim();
  return rows
    .map((r) => summarize(r, bonusRows, benefitRows, useRows, ctx.today))
    .filter(
      (a) =>
        (!filter.kind || a.kind === filter.kind) &&
        (!filter.status || a.status === filter.status) &&
        (!filter.institutionId || a.institutionId === filter.institutionId) &&
        (!q ||
          [a.label, a.productName, a.institutionName, a.last4, a.notes].some((s) => s?.toLowerCase().includes(q))),
    );
}

async function requireAccount(ctx: ServiceContext, id: string) {
  const row = await ctx.db
    .select()
    .from(accounts)
    .where(and(eq(accounts.id, id), eq(accounts.ownerId, ctx.ownerId)))
    .get();
  if (!row) throw new NotFoundError(`Account ${id}`);
  return row;
}

export async function getAccount(ctx: ServiceContext, id: string) {
  await requireAccount(ctx, id);
  const [joined] = await loadJoined(ctx, eq(accounts.id, id));
  const [eventRows, bonusRows, benefitRows] = await Promise.all([
    ctx.db.select().from(events).where(and(eq(events.accountId, id), eq(events.ownerId, ctx.ownerId))).orderBy(desc(events.date), desc(events.createdAt)),
    ctx.db.select().from(bonuses).where(and(eq(bonuses.accountId, id), eq(bonuses.ownerId, ctx.ownerId))).orderBy(asc(bonuses.deadline)),
    ctx.db.select().from(benefits).where(and(eq(benefits.accountId, id), eq(benefits.ownerId, ctx.ownerId))).orderBy(asc(benefits.name)),
  ]);
  const useRows = benefitRows.length
    ? await ctx.db.select().from(benefitUses).where(and(eq(benefitUses.ownerId, ctx.ownerId), inArray(benefitUses.benefitId, benefitRows.map((b) => b.id)))).orderBy(desc(benefitUses.usedOn))
    : [];
  const summary = summarize(joined!, bonusRows, benefitRows, useRows, ctx.today);
  return {
    ...summary,
    product: joined!.product,
    events: eventRows,
    bonuses: bonusRows.map((b) => ({ ...b, ...bonusProgress(b, ctx.today) })),
    benefits: benefitRows.map((b) => {
      const uses = useRows.filter((u) => u.benefitId === b.id);
      return { ...b, ...benefitStatus(b, uses, ctx.today, summary.openedAt), uses };
    }),
  };
}

export async function createAccount(
  ctx: ServiceContext,
  input: z.infer<typeof accountInput>,
  opts: { autoEvents?: boolean } = {},
) {
  await ensureCatalog(ctx);
  let ownerType = input.ownerType;
  if (input.productId) {
    const p = await getActiveProduct(ctx, input.productId);
    ownerType ??= p.ownerType;
    if (p.kind !== input.kind) throw new BadRequestError(`Product ${p.id} is a ${p.kind}, not a ${input.kind}`);
  }
  const id = newId();
  const row: typeof accounts.$inferInsert = {
    id,
    ownerId: ctx.ownerId,
    kind: input.kind,
    ownerType: ownerType ?? "personal",
    productId: input.productId ?? null,
    institutionId: input.institutionId ?? null,
    nickname: input.nickname ?? null,
    last4: input.last4 ?? null,
    status: input.status,
    appliedAt: input.appliedAt ?? null,
    openedAt: input.openedAt ?? null,
    closedAt: input.closedAt ?? null,
    isAuthorizedUser: input.isAuthorizedUser,
    details: input.details,
    notes: input.notes ?? null,
  };
  const stmts: any[] = [ctx.db.insert(accounts).values(row)];
  if (opts.autoEvents !== false) {
    const ev = (type: EventType, date: string) =>
      ctx.db.insert(events).values({ id: newId(), ownerId: ctx.ownerId, accountId: id, type, date });
    if (row.appliedAt) stmts.push(ev("applied", row.appliedAt));
    if (row.status === "denied" && (row.appliedAt || row.openedAt)) stmts.push(ev("denied", (row.appliedAt ?? row.openedAt)!));
    if (row.status !== "denied" && row.openedAt) stmts.push(ev("approved", row.openedAt));
    if (row.closedAt) stmts.push(ev("closed", row.closedAt));
  }
  await ctx.db.batch(stmts as [any, ...any[]]);
  return getAccount(ctx, id);
}

export async function updateAccount(ctx: ServiceContext, id: string, patch: z.infer<typeof accountPatch>) {
  const current = await requireAccount(ctx, id);
  if (patch.kind && patch.kind !== current.kind) throw new BadRequestError("An account's kind cannot be changed");
  if (patch.productId && patch.productId !== current.productId) {
    const p = await getActiveProduct(ctx, patch.productId);
    if (p.kind !== current.kind) throw new BadRequestError(`Product ${p.id} is a ${p.kind}, not a ${current.kind}`);
  }
  await ctx.db
    .update(accounts)
    .set({ ...patch, updatedAt: nowIso() })
    .where(and(eq(accounts.id, id), eq(accounts.ownerId, ctx.ownerId)));
  return getAccount(ctx, id);
}

export async function deleteAccount(ctx: ServiceContext, id: string) {
  await requireAccount(ctx, id);
  // Explicit child deletes (D1 enforces FKs, but be explicit about ownership).
  const benefitIds = (
    await ctx.db.select({ id: benefits.id }).from(benefits).where(and(eq(benefits.accountId, id), eq(benefits.ownerId, ctx.ownerId)))
  ).map((b) => b.id);
  const stmts: any[] = [];
  if (benefitIds.length) stmts.push(ctx.db.delete(benefitUses).where(inArray(benefitUses.benefitId, benefitIds)));
  stmts.push(
    ctx.db.delete(accountSecrets).where(eq(accountSecrets.accountId, id)),
    ctx.db.delete(benefits).where(eq(benefits.accountId, id)),
    ctx.db.delete(bonuses).where(eq(bonuses.accountId, id)),
    ctx.db.delete(events).where(eq(events.accountId, id)),
    ctx.db.delete(accounts).where(and(eq(accounts.id, id), eq(accounts.ownerId, ctx.ownerId))),
  );
  await ctx.db.batch(stmts as [any, ...any[]]);
  return { deleted: id };
}

/**
 * Record a timeline event and apply its side effects to the account:
 * approved -> open, denied -> denied, closed -> closed, product changes -> new product,
 * bonus_earned -> marks the account's in-progress bonus as posted.
 */
export async function recordEvent(ctx: ServiceContext, accountId: string, input: z.infer<typeof eventInput>) {
  const account = await requireAccount(ctx, accountId);
  const patch: Partial<typeof accounts.$inferInsert> = {};
  let fromProductId = input.fromProductId ?? null;
  const toProductId = input.toProductId ?? null;
  const stmts: any[] = [];

  switch (input.type) {
    case "applied":
      if (!account.appliedAt) patch.appliedAt = input.date;
      break;
    case "approved":
      patch.status = "open";
      if (!account.openedAt) patch.openedAt = input.date;
      break;
    case "denied":
      patch.status = "denied";
      break;
    case "closed":
      patch.status = "closed";
      patch.closedAt = input.date;
      break;
    case "product_change":
    case "upgrade":
    case "downgrade":
      if (!toProductId) throw new BadRequestError(`${input.type} requires toProductId (create the product first with add_product / POST /api/products if it is not in the catalog)`);
      {
        const p = await getActiveProduct(ctx, toProductId);
        if (p.kind !== account.kind) throw new BadRequestError(`Product ${p.id} is a ${p.kind}, not a ${account.kind}`);
      }
      fromProductId ??= account.productId;
      patch.productId = toProductId;
      break;
    case "bonus_earned": {
      const pending = await ctx.db
        .select()
        .from(bonuses)
        .where(and(eq(bonuses.accountId, accountId), eq(bonuses.ownerId, ctx.ownerId), inArray(bonuses.status, ["in_progress", "met"])))
        .orderBy(asc(bonuses.deadline));
      const target = (input.data.bonusId as string | undefined)
        ? pending.find((b) => b.id === input.data.bonusId)
        : pending[0];
      if (target)
        stmts.push(
          ctx.db
            .update(bonuses)
            .set({ status: "posted", earnedAt: input.date, updatedAt: nowIso() })
            .where(eq(bonuses.id, target.id)),
        );
      break;
    }
    case "note":
      break;
  }

  const id = newId();
  stmts.unshift(
    ctx.db.insert(events).values({
      id,
      ownerId: ctx.ownerId,
      accountId,
      type: input.type,
      date: input.date,
      fromProductId,
      toProductId,
      note: input.note ?? null,
      data: { ...input.data, ...(input.type === "bonus_earned" && !input.data.productId && account.productId ? { productId: account.productId } : {}) },
    }),
  );
  if (Object.keys(patch).length)
    stmts.push(ctx.db.update(accounts).set({ ...patch, updatedAt: nowIso() }).where(eq(accounts.id, accountId)));
  await ctx.db.batch(stmts as [any, ...any[]]);
  return ctx.db.select().from(events).where(eq(events.id, id)).get();
}

export async function deleteEvent(ctx: ServiceContext, eventId: string) {
  const row = await ctx.db.select().from(events).where(and(eq(events.id, eventId), eq(events.ownerId, ctx.ownerId))).get();
  if (!row) throw new NotFoundError(`Event ${eventId}`);
  await ctx.db.delete(events).where(eq(events.id, eventId));
  return { deleted: eventId };
}
