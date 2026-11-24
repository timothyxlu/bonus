import { today } from "@bonus/core";
import { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { getDb } from "../db/client";
import type { Env, McpProps } from "../env";
import { accountInput, accountPatch, benefitUseInput, eventInput, institutionInput, institutionPatch, isoDate, offerInput, offerPatch, productInput, productPatch } from "../schemas";
import * as catalog from "../services/catalog";
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
      description:
        "Search the product catalog (seeded defaults plus the user's own products and edits). Returns ids for add_account, record_event (toProductId), add_offer and check_eligibility. If a product is missing, create it with add_product.",
      inputSchema: z.object({
        q: z.string().optional().describe("Free-text search over id, name, institution and family, e.g. 'hilton' or 'aadvantage'"),
        institutionId: z.string().optional().describe("e.g. chase, amex, citi, boa, barclays, us_bank, wells_fargo"),
        kind: z.enum(["credit_card", "bank_account", "gift_card"]).optional(),
        includeArchived: z.boolean().optional(),
      }),
      annotations: { readOnlyHint: true },
    },
    tool(async (f) =>
      (await listProducts(svc(), f)).map((p) => ({
        id: p.id,
        name: p.name,
        institutionId: p.institutionId,
        institution: p.institutionName,
        kind: p.kind,
        ownerType: p.ownerType,
        family: p.family,
        annualFee: p.annualFee,
        currency: p.currency,
        rules: p.rules,
        source: p.isCatalog ? (p.customized ? "catalog (edited)" : "catalog") : "user",
        archived: p.archived,
      })),
    ),
  );

  server.registerTool(
    "list_institutions",
    {
      description: "List institutions (card issuers, banks, merchants) and their ids. Create a missing one with add_institution.",
      inputSchema: z.object({}),
      annotations: { readOnlyHint: true },
    },
    tool(async () => (await catalog.listInstitutions(svc())).map((i) => ({ id: i.id, name: i.name, type: i.type, source: i.isCatalog ? "catalog" : "user" }))),
  );

  server.registerTool(
    "add_institution",
    {
      description:
        "Create an institution the catalog lacks (e.g. Synchrony, a credit union, a merchant). id is an optional lowercase slug ([a-z0-9_-], derived from the name if omitted); type is issuer (card issuer), bank, or merchant (gift cards).",
      inputSchema: institutionInput,
    },
    tool(async (a) => catalog.createInstitution(svc(), a)),
  );

  server.registerTool(
    "update_institution",
    {
      description: "Rename an institution or change its type. Editing a built-in institution stores a personal override; the shared default is not changed.",
      inputSchema: institutionPatch.extend({ institutionId: z.string() }),
    },
    tool(async ({ institutionId, ...patch }) => catalog.updateInstitution(svc(), institutionId, patch)),
  );

  server.registerTool(
    "add_product",
    {
      description: [
        "Create a catalog product (e.g. a card the catalog lacks) so accounts, product changes and offers can use it.",
        "Fields: institutionId (from list_institutions), name, kind (default credit_card), ownerType personal|business, annualFee (USD), network, currency (points programme, e.g. 'Hilton Honors'), family, id (optional slug; generated as <institution>-<name> if omitted).",
        "family groups related products for issuer rules: chase_sapphire (Sapphire rule), amex_* ladders, citi_thankyou, citi_aadvantage, ...",
        "rules (all optional): lifetimeBonus (Amex once-per-lifetime), familyRank (Amex family ladder: higher = more premium; having held a same-or-higher rank blocks lower ones), bonusCooldownMonths (+ cooldownScope 'product'|'family', e.g. Citi 48, Chase 24), isCharge (Amex charge card, excluded from the 5-credit-card limit), reportsToPersonal (business card that counts toward 5/24), currentHolderIneligible (default true).",
      ].join(" "),
      inputSchema: productInput,
    },
    tool(async (a) => catalog.createProduct(svc(), a)),
  );

  server.registerTool(
    "update_product",
    {
      description:
        "Edit a product: any of name, institutionId, ownerType, family, annualFee, network, currency, kind (only if no account uses it), and rules (partial: a value sets a rule, null clears it, omitted keeps it). Editing a built-in catalog product stores a personal override; the shared default and future catalog syncs do not overwrite it.",
      inputSchema: productPatch.extend({ productId: z.string() }),
    },
    tool(async ({ productId, ...patch }) => catalog.updateProduct(svc(), productId, patch)),
  );

  server.registerTool(
    "archive_product",
    {
      description:
        "Archive (hide from pickers) or unarchive a product. Products are never deleted: accounts and history that reference an archived product keep working.",
      inputSchema: z.object({ productId: z.string(), archived: z.boolean().default(true) }),
    },
    tool(async ({ productId, archived }) => catalog.archiveProduct(svc(), productId, archived)),
  );

  server.registerTool(
    "add_account",
    {
      description: "Add an account. Give productId (from list_products) or institutionId. last4 = the trailing 4 or 5 digits only (Amex shows 5) - never send full card or account numbers. Dates are YYYY-MM-DD.",
      inputSchema: accountInput,
    },
    tool(async (a) => accounts.createAccount(svc(), a)),
  );

  server.registerTool(
    "update_account",
    {
      description:
        "Edit an existing account. Any of: nickname, last4 (trailing 4 or 5 digits only - never full numbers), productId (same kind; prefer record_event product_change to keep history), institutionId, ownerType, status (pending|open|closed|denied), appliedAt/openedAt/closedAt (YYYY-MM-DD, null to clear), isAuthorizedUser, notes, details.",
      inputSchema: accountPatch.omit({ kind: true }).extend({ accountId: z.string() }),
    },
    tool(async ({ accountId, ...patch }) => accounts.updateAccount(svc(), accountId, patch)),
  );

  server.registerTool(
    "delete_account",
    {
      description:
        "Permanently delete one of the user's accounts together with its timeline events, bonuses, benefits and benefit uses (e.g. to remove a duplicate created during import). Cannot be undone - confirm the accountId with get_account first.",
      inputSchema: z.object({ accountId: z.string() }),
      annotations: { destructiveHint: true },
    },
    tool(async ({ accountId }) => accounts.deleteAccount(svc(), accountId)),
  );

  server.registerTool(
    "record_event",
    {
      description:
        "Record a timeline event on an account: applied, approved (sets status open + openedAt), denied, closed (status closed + closedAt), product_change/upgrade/downgrade (requires toProductId of the same kind; switches the account's current product and keeps the old one in history - create the product first with add_product if it is not listed), bonus_earned (marks the pending bonus as posted; this date drives 24/48-month rules), note.",
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
