import { eq } from "drizzle-orm";
import type { z } from "zod";
import { userPreferences } from "../db/schema";
import type { preferencesPatch } from "../schemas";
import { nowIso, type ServiceContext } from "./context";

export interface Preferences {
  homeState: string | null;
  updatedAt: string | null;
}

export async function getPreferences(ctx: ServiceContext): Promise<Preferences> {
  const row = await ctx.db.select().from(userPreferences).where(eq(userPreferences.ownerId, ctx.ownerId)).get();
  return { homeState: row?.homeState ?? null, updatedAt: row?.updatedAt ?? null };
}

export async function updatePreferences(ctx: ServiceContext, patch: z.infer<typeof preferencesPatch>): Promise<Preferences> {
  const updatedAt = nowIso();
  await ctx.db
    .insert(userPreferences)
    .values({ ownerId: ctx.ownerId, homeState: patch.homeState, updatedAt })
    .onConflictDoUpdate({ target: userPreferences.ownerId, set: { homeState: patch.homeState, updatedAt } });
  return getPreferences(ctx);
}
