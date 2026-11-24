import { today } from "@bonus/core";
import { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { getDb } from "../db/client";
import type { Env, McpProps } from "../env";
import { accountInput, benefitUseInput, eventInput, isoDate, offerInput, offerPatch } from "../schemas";
import * as offers from "../services/offers";
import * as accounts from "../services/accounts";
import * as bon from "../services/bonuses";
import { listProducts } from "../services/catalog";
import type { ServiceContext } from "../services/context";
import { checkProductEligibility, getFive24 } from "../services/eligibility";

const json = (data: unknown) => ({ content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] });
const fail = (err: unknown) => ({ isError: true, content: [{ type: "text" as const, text: (err as Error).message ?? String(err) }] });

/** Wrap a tool body so service errors become MCP tool errors instead of protocol errors. */
function tool<A>(fn: (args: A) => Promise<unknown>) {
  return async (args: A) => {
    try {
      return json(await fn(args));
    } catch (err) {
      return fail(err);
    }
  };
}

/** Build the MCP server for one authenticated user. Uses the same service layer as /api. */
export function createMcpServer(env: Env, props: McpProps, now: () => string = () => today()) {
  const server = new McpServer({ name: "bonus", version: "0.1.0" });
  const svc = (): ServiceContext => ({ db: getDb(env.DB), ownerId: props.email.toLowerCase(), today: now() });

  server.registerTool(
    "list_accounts",
    {
      description: "List the user's accounts (credit cards; later bank accounts and gift cards) with product, status, open date, active bonus and unused benefit count.",
      inputSchema: z.object({
        kind: z.enum(["credit_card", "bank_account", "gift_card"]).optional(),
        status: z.enum(["pending", "open", "closed", "denied"]).optional(),
        q: z.string().optional().describe("Free-text search over name, issuer, last4, notes"),
      }),
      annotations: { readOnlyHint: true },
    },
    tool(async (a) => accounts.listAccounts(svc(), a)),
  );

  server.registerTool(
    "get_account",
    {
      description: "Get one account with its timeline events, bonuses (with progress) and benefits (with current-period status).",
      inputSchema: z.object({ accountId: z.string() }),
      annotations: { readOnlyHint: true },
    },
    tool(async ({ accountId }) => accounts.getAccount(svc(), accountId)),
  );

  server.registerTool(
    "list_products",
    {
      description: "List catalog products (card products) and their ids, for use with add_account and check_eligibility.",
      inputSchema: z.object({ institutionId: z.string().optional().describe("e.g. chase, amex, citi, boa, barclays") }),
      annotations: { readOnlyHint: true },
    },
    tool(async ({ institutionId }) =>
      (await listProducts(svc(), { institutionId })).map((p) => ({
        id: p.id,
        name: p.name,
        institution: p.institutionName,
        ownerType: p.ownerType,
        family: p.family,
        annualFee: p.annualFee,
      })),
    ),
  );

  server.registerTool(
    "add_account",
    {
      description: "Add an account. Give productId (from list_products) or institutionId. Only the LAST 4 digits may be stored - never send full card or account numbers. Dates are YYYY-MM-DD.",
      inputSchema: accountInput,
    },
    tool(async (a) => accounts.createAccount(svc(), a)),
  );

  server.registerTool(
    "record_event",
    {
      description: "Record a timeline event on an account: applied, approved, denied, product_change/upgrade/downgrade (requires toProductId), closed, bonus_earned (marks the pending bonus as posted), note. Updates account status accordingly.",
      inputSchema: eventInput.extend({ accountId: z.string() }),
    },
    tool(async ({ accountId, ...e }) => accounts.recordEvent(svc(), accountId, e)),
  );

  server.registerTool(
    "list_benefits",
    {
      description: "List recurring benefits/credits on open accounts with used/remaining amounts for the current period.",
      inputSchema: z.object({ accountId: z.string().optional(), unusedOnly: z.boolean().optional() }),
      annotations: { readOnlyHint: true },
    },
    tool(async (a) => bon.listBenefits(svc(), a)),
  );

  server.registerTool(
    "mark_benefit_used",
    {
      description: "Record that a benefit was used. amount defaults to the full benefit amount; usedOn defaults to today.",
      inputSchema: benefitUseInput.partial().extend({ benefitId: z.string() }),
    },
    tool(async ({ benefitId, usedOn, amount, note }) =>
      bon.markBenefitUsed(svc(), benefitId, { usedOn: usedOn ?? now(), amount: amount ?? 0, note }),
    ),
  );

  server.registerTool(
    "list_bonuses",
    {
      description: "List bonuses across all account kinds (credit card sign-up bonuses, bank account bonuses, gift card promos) with progress, filtered by status and/or kind.",
      inputSchema: z.object({
        status: z.array(z.enum(["in_progress", "met", "posted", "failed", "cancelled"])).optional(),
        kind: z.enum(["credit_card", "bank_account", "gift_card"]).optional(),
      }),
      annotations: { readOnlyHint: true },
    },
    tool(async ({ status, kind }) => bon.listBonuses(svc(), { statuses: status, kind })),
  );

  server.registerTool(
    "list_opportunities",
    {
      description: "Ranked opportunities (offers the user could open next: credit card sign-up offers, bank account bonuses, gift card promos) with estimated USD value (points valued per programme), net of first-year fee and costs, return on required spend/deposit, and eligibility against the user's history (eligible | uncertain | blocked with eligibleFrom).",
      inputSchema: z.object({ kind: z.enum(["credit_card", "bank_account", "gift_card"]).optional() }),
      annotations: { readOnlyHint: true },
    },
    tool(async ({ kind }) => offers.listOpportunities(svc(), { kind })),
  );

  server.registerTool(
    "add_offer",
    {
      description: "Record an offer for the opportunities page, e.g. after researching current public offers. Use productId (from list_products) for credit cards; otherwise institutionId (create it first in the app if needed). rewardUnit points/miles/USD; optional centsPerPoint or estValueUsd override the valuation; cooldownMonths encodes 'no bonus if you received one from this bank in the last N months'. Include sourceUrl.",
      inputSchema: offerInput,
    },
    tool(async (a) => offers.createOffer(svc(), a)),
  );

  server.registerTool(
    "update_offer",
    {
      description: "Update an offer (e.g. new amount or expiry) or archive it with status 'archived' when it ends.",
      inputSchema: offerPatch.extend({ offerId: z.string() }),
    },
    tool(async ({ offerId, ...patch }) => offers.updateOffer(svc(), offerId, patch)),
  );

  server.registerTool(
    "upcoming_deadlines",
    {
      description: "Active bonuses of every kind (cards, bank accounts, gift cards) ordered by nearest deadline, with progress and days left.",
      inputSchema: z.object({ withinDays: z.number().int().min(0).optional() }),
      annotations: { readOnlyHint: true },
    },
    tool(async ({ withinDays }) => bon.upcomingDeadlines(svc(), { withinDays })),
  );

  server.registerTool(
    "check_eligibility",
    {
      description: "Check whether the user is likely eligible for a product's sign-up bonus given their history (Chase 5/24 & Sapphire, Amex lifetime/family/credit-card limit, Citi 48-month & 1/8 & 2/65, BoA 2/3/4, Barclays 6/24). Returns eligible | blocked | uncertain, reasons and eligibleFrom.",
      inputSchema: z.object({ productId: z.string(), asOf: isoDate.optional() }),
      annotations: { readOnlyHint: true },
    },
    tool(async ({ productId, asOf }) => checkProductEligibility(svc(), productId, { asOf })),
  );

  server.registerTool(
    "five_24_status",
    {
      description: "Current Chase 5/24 count, the accounts counted, when each drops off, and when the count next falls below 5.",
      inputSchema: z.object({ asOf: isoDate.optional() }),
      annotations: { readOnlyHint: true },
    },
    tool(async ({ asOf }) => getFive24(svc(), { asOf })),
  );

  return server;
}
