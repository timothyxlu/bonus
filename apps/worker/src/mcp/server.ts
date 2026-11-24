import { today } from "@bonus/core";
import { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { getDb } from "../db/client";
import type { Env, McpProps } from "../env";
import { accountInput, accountPatch, benefitInput, benefitPatch, benefitUseInput, bonusInput, bonusPatch, eventInput, hotelCertificateInput, hotelCertificatePatch, institutionInput, institutionPatch, isoDate, loyaltyBalanceInput, loyaltyBalancePatch, LOYALTY_CATEGORIES, offerInput, offerPatch, productInput, productPatch } from "../schemas";
import * as catalog from "../services/catalog";
import * as certificates from "../services/certificates";
import * as offers from "../services/offers";
import * as accounts from "../services/accounts";
import * as bon from "../services/bonuses";
import { listProducts } from "../services/catalog";
import type { ServiceContext } from "../services/context";
import { checkProductEligibility, getFive24 } from "../services/eligibility";
import * as loyalty from "../services/loyalty";

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
    "list_loyalty_balances",
    {
      description: "List the authenticated user's airline, hotel and credit-card points or miles balances. Duplicate program names are separate accounts.",
      inputSchema: z.object({ category: z.enum(LOYALTY_CATEGORIES).optional() }),
      annotations: { readOnlyHint: true },
    },
    tool(({ category }) => loyalty.listBalances(svc(), category)),
  );

  server.registerTool(
    "add_loyalty_balance",
    {
      description: "Add one points or miles balance. category is flight, hotel or credit_card; program is a display label and need not be unique.",
      inputSchema: loyaltyBalanceInput,
    },
    tool((input) => loyalty.createBalance(svc(), input)),
  );

  server.registerTool(
    "update_loyalty_balance",
    {
      description: "Update a loyalty balance's category, program label, non-negative integer balance or notes.",
      inputSchema: loyaltyBalancePatch.extend({ balanceId: z.string() }),
    },
    tool(({ balanceId, ...patch }) => loyalty.updateBalance(svc(), balanceId, patch)),
  );

  server.registerTool(
    "delete_loyalty_balance",
    {
      description: "Permanently delete one loyalty balance by id.",
      inputSchema: z.object({ balanceId: z.string() }),
      annotations: { destructiveHint: true },
    },
    tool(({ balanceId }) => loyalty.deleteBalance(svc(), balanceId)),
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
      description:
        "List recurring benefits/credits with their current period (start inclusive, end exclusive), amount available this period (honours per-period overrides), used, remaining, unused flag, yearly total (annualAmount in the benefit's unit; annualValueUsd) and all fields (unit, period, everyMonths, amountByPeriod, enrollmentRequired, limitations, sourceUrl, startsAt, endsAt). By default only active benefits on open accounts that are in effect today.",
      inputSchema: z.object({
        accountId: z.string().optional(),
        unusedOnly: z.boolean().optional(),
        includeInactive: z.boolean().optional().describe("Also archived benefits, closed accounts and benefits outside startsAt/endsAt"),
      }),
      annotations: { readOnlyHint: true },
    },
    tool(async (a) => bon.listBenefits(svc(), a)),
  );

  const benefitHelp = [
    "period: monthly | quarterly | semiannual (Jan-Jun, Jul-Dec) | annual (calendar year) | cardmember_year (resets on the account's anniversary, from openedAt) | every_n_years (give everyYears, fractional ok: Global Entry 4, PreCheck 4.5; cycles start at startsAt, else the account's openedAt).",
    "amount: per period, in USD for unit USD; for unit free_night | certificate | other it is the count per period (usually 1) - describe it in valueDescription (e.g. 'Free night up to 35k points') and optionally estValueUsd per unit.",
    "amountByPeriod: optional uneven schedule for monthly/quarterly/semiannual, keyed by period number within the calendar year (month 1-12, quarter 1-4, half 1-2), e.g. Uber Cash amount 15 with amountByPeriod {\"12\": 35}.",
    "enrollmentRequired, limitations (merchant / restrictions text), sourceUrl, notes, startsAt / endsAt (YYYY-MM-DD; endsAt exclusive, e.g. a credit ending 2027-02-17), active (false = archived).",
  ].join(" ");

  server.registerTool(
    "add_benefit",
    {
      description: `Add a recurring benefit/credit to one of the user's accounts (accountId from list_accounts). ${benefitHelp}`,
      inputSchema: benefitInput.extend({ accountId: z.string() }),
    },
    tool(async ({ accountId, ...b }) => bon.createBenefit(svc(), accountId, b)),
  );

  server.registerTool(
    "update_benefit",
    {
      description: `Edit a benefit (benefitId from list_benefits). Only the fields you pass change; null clears an optional field. ${benefitHelp}`,
      inputSchema: benefitPatch.extend({ benefitId: z.string() }),
    },
    tool(async ({ benefitId, ...patch }) => bon.updateBenefit(svc(), benefitId, patch)),
  );

  server.registerTool(
    "delete_benefit",
    {
      description: "Permanently delete a benefit and its usage records. To keep history, prefer update_benefit with active: false.",
      inputSchema: z.object({ benefitId: z.string() }),
      annotations: { destructiveHint: true },
    },
    tool(async ({ benefitId }) => bon.deleteBenefit(svc(), benefitId)),
  );

  server.registerTool(
    "mark_benefit_used",
    {
      description:
        "Record that a benefit was used (counts toward the period containing usedOn, default today). amount defaults to what is left in that period for USD benefits (override-aware), or 1 unit for free nights / certificates.",
      inputSchema: benefitUseInput.partial().extend({ benefitId: z.string() }),
    },
    tool(async ({ benefitId, usedOn, amount, note }) =>
      bon.markBenefitUsed(svc(), benefitId, { usedOn: usedOn ?? now(), amount: amount ?? 0, note }),
    ),
  );

  server.registerTool(
    "list_hotel_certificates",
    {
      description:
        "List individually issued hotel free-night certificates, separate from recurring benefit definitions. Returns account/card and hotel program context, expiration, derived unused|used|expired status and daysUntilExpiration.",
      inputSchema: z.object({
        accountId: z.string().optional(),
        status: z.enum(["unused", "used", "expired"]).optional(),
        expiringWithinDays: z.number().int().min(0).max(3650).optional(),
      }),
      annotations: { readOnlyHint: true },
    },
    tool(async (a) => certificates.listCertificates(svc(), a)),
  );

  server.registerTool(
    "add_hotel_certificate",
    {
      description:
        "Track one actually issued hotel free-night certificate. accountId, hotelProgram and expiresOn (YYYY-MM-DD) are required. benefitId may link it to the recurring free_night/certificate entitlement that produced it; no expiry is inferred from that benefit.",
      inputSchema: hotelCertificateInput.extend({ accountId: z.string() }),
    },
    tool(async ({ accountId, ...input }) => certificates.createCertificate(svc(), accountId, input)),
  );

  server.registerTool(
    "update_hotel_certificate",
    {
      description: "Edit an issued hotel certificate. Only fields passed are changed; usedAt can be set to a date or null to restore unused status.",
      inputSchema: hotelCertificatePatch.extend({ certificateId: z.string() }),
    },
    tool(async ({ certificateId, ...patch }) => certificates.updateCertificate(svc(), certificateId, patch)),
  );

  server.registerTool(
    "mark_hotel_certificate_used",
    {
      description: "Mark an issued hotel free-night certificate used, optionally on a historical YYYY-MM-DD date (defaults to today).",
      inputSchema: z.object({ certificateId: z.string(), usedAt: isoDate.optional() }),
    },
    tool(async ({ certificateId, usedAt }) => certificates.markCertificateUsed(svc(), certificateId, usedAt ?? now())),
  );

  server.registerTool(
    "delete_hotel_certificate",
    {
      description: "Permanently delete an individually tracked hotel certificate.",
      inputSchema: z.object({ certificateId: z.string() }),
      annotations: { destructiveHint: true },
    },
    tool(async ({ certificateId }) => certificates.deleteCertificate(svc(), certificateId)),
  );

  server.registerTool(
    "list_bonuses",
    {
      description: "List bonuses across all account kinds (credit card sign-up bonuses, bank account bonuses, gift card promos) with progress, filtered by status and/or kind. Multi-condition bonuses include steps (each with state done | holding | pending | overdue, ratio, daysLeft), stepsMet and currentStep. Ids feed update_bonus / delete_bonus.",
      inputSchema: z.object({
        status: z.array(z.enum(["in_progress", "met", "posted", "failed", "cancelled"])).optional(),
        kind: z.enum(["credit_card", "bank_account", "gift_card"]).optional(),
      }),
      annotations: { readOnlyHint: true },
    },
    tool(async ({ status, kind }) => bon.listBonuses(svc(), { statuses: status, kind })),
  );

  const bonusHelp = [
    "One bonus = one offer on one account, however many conditions it has.",
    "Simple offer: requirementType (spend | deposit | direct_deposit | balance | other), amountRequired (USD), progress, deadline (YYYY-MM-DD).",
    "Multi-condition offer (typical bank bonus: 'deposit $15k of new money within 30 days, then keep $15k until day 90'): give steps, an ordered list of {type, amount, progress, dueBy, holdFrom, holdUntil, description, done}.",
    "A deposit/spend/direct_deposit step is met once progress >= amount; a balance step with holdUntil is 'holding' while progress (current balance) >= amount and met after holdUntil has passed (holdFrom defaults to the previous step's dueBy); a step with no amount is met only when done is true.",
    "When steps are given, overall progress, days left and overdue come from the steps, deadline defaults to the last step date, and the bonus status moves to met automatically once every step is met.",
    "rewardAmount + rewardUnit (points | miles | USD). status: in_progress | met | posted (bonus paid; earnedAt defaults to today) | failed | cancelled.",
  ].join(" ");

  server.registerTool(
    "add_bonus",
    {
      description: `Add a bonus (credit card sign-up bonus, bank account bonus, gift card promo) to one of the user's accounts (accountId from list_accounts). ${bonusHelp}`,
      inputSchema: bonusInput.extend({ accountId: z.string() }),
    },
    tool(async ({ accountId, ...b }) => bon.createBonus(svc(), accountId, b)),
  );

  server.registerTool(
    "update_bonus",
    {
      description: `Edit a bonus (bonusId from list_bonuses or get_account): progress, status, deadline, reward, description... Only the fields you pass change; null clears an optional field. steps replaces the whole list, so send every step (e.g. to update one step's progress or set done: true, resend the list from list_bonuses with that step changed). ${bonusHelp}`,
      inputSchema: bonusPatch.extend({ bonusId: z.string() }),
    },
    tool(async ({ bonusId, ...patch }) => bon.updateBonus(svc(), bonusId, patch)),
  );

  server.registerTool(
    "delete_bonus",
    {
      description: "Permanently delete a bonus. A bonus that did not pay out is better kept with update_bonus status failed or cancelled, since posted dates feed the issuer rules.",
      inputSchema: z.object({ bonusId: z.string() }),
      annotations: { destructiveHint: true },
    },
    tool(async ({ bonusId }) => bon.deleteBonus(svc(), bonusId)),
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
      description: "Record an offer for the opportunities page, e.g. after researching current public offers. Use productId (from list_products) for credit cards; otherwise institutionId (create it first in the app if needed). rewardUnit points/miles/USD; optional centsPerPoint or estValueUsd override the valuation; cooldownMonths encodes 'no bonus if you received one from this bank in the last N months'. Include sourceUrl. Multi-condition offers (typical bank bonus: 'deposit $15k of new money within 30 days and keep $15k until day 90') go in steps, an ordered list of {type: spend | deposit | direct_deposit | balance | other, amount (USD), withinDays (finish within N days of opening), holdDays (balance steps: keep the amount until day N after opening), description}; the largest step amount counts as the required amount for return-on-deposit, and opening the account turns the steps into one dated multi-step bonus.",
      inputSchema: offerInput,
    },
    tool(async (a) => offers.createOffer(svc(), a)),
  );

  server.registerTool(
    "update_offer",
    {
      description: "Update an offer (e.g. new amount, expiry or steps) or archive it with status 'archived' when it ends. Only the fields you pass change; steps replaces the whole list (see add_offer for the step format).",
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
