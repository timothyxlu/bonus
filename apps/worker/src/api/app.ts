import { ACCOUNT_KINDS, BONUS_STATUSES, today } from "@bonus/core";
import { Hono, type Context } from "hono";
import { z, type ZodType } from "zod";
import { AuthError, verifyAccessRequest, type Identity } from "../auth/access-jwt";
import { getDb } from "../db/client";
import type { Env } from "../env";
import {
  accountInput,
  accountPatch,
  benefitInput,
  benefitPatch,
  benefitUseInput,
  bonusInput,
  bonusPatch,
  eventInput,
  claimOfferInput,
  institutionInput,
  offerInput,
  offerPatch,
  isoDate,
  productInput,
  productPatch,
} from "../schemas";
import * as accounts from "../services/accounts";
import * as bon from "../services/bonuses";
import * as catalog from "../services/catalog";
import { BadRequestError, NotFoundError, type ServiceContext } from "../services/context";
import { getDashboard } from "../services/dashboard";
import { checkAllProducts, checkProductEligibility, getFive24 } from "../services/eligibility";
import { csvToImportPayload, importHistory } from "../services/import";
import * as offersSvc from "../services/offers";

type Vars = { identity: Identity; svc: ServiceContext };
export type ApiEnv = { Bindings: Env; Variables: Vars };

async function body<T extends ZodType>(c: Context, schema: T): Promise<z.infer<T>> {
  let json: unknown;
  try {
    json = await c.req.json();
  } catch {
    throw new BadRequestError("Request body must be JSON");
  }
  const r = schema.safeParse(json);
  if (!r.success) throw new BadRequestError(r.error.issues.map((i) => `${i.path.join(".") || "body"}: ${i.message}`).join("; "));
  return r.data;
}

const asOfParam = (c: Context) => {
  const v = c.req.query("asOf");
  if (v === undefined) return undefined;
  if (!isoDate.safeParse(v).success) throw new BadRequestError("asOf must be YYYY-MM-DD");
  return v;
};

export function createApi() {
  const api = new Hono<ApiEnv>().basePath("/api");

  api.onError((err, c) => {
    if (err instanceof AuthError) return c.json({ error: err.message }, err.status);
    if (err instanceof NotFoundError) return c.json({ error: err.message }, 404);
    if (err instanceof BadRequestError) return c.json({ error: err.message }, 400);
    console.error(err);
    return c.json({ error: "Internal error" }, 500);
  });

  api.get("/health", (c) => c.json({ ok: true }));

  // Every other /api route requires a verified Cloudflare Access identity.
  api.use("*", async (c, next) => {
    if (c.req.path === "/api/health") return next();
    const identity = await verifyAccessRequest(c.req.raw, c.env);
    c.set("identity", identity);
    c.set("svc", { db: getDb(c.env.DB), ownerId: identity.email, today: today() });
    await next();
  });

  api.get("/me", (c) => c.json({ email: c.var.identity.email, source: c.var.identity.source }));

  // Catalog
  api.get("/institutions", async (c) => c.json(await catalog.listInstitutions(c.var.svc)));
  api.post("/institutions", async (c) => c.json(await catalog.createInstitution(c.var.svc, await body(c, institutionInput)), 201));
  api.get("/products", async (c) =>
    c.json(await catalog.listProducts(c.var.svc, { kind: c.req.query("kind"), institutionId: c.req.query("institutionId") })),
  );
  api.post("/products", async (c) => c.json(await catalog.createProduct(c.var.svc, await body(c, productInput)), 201));
  api.patch("/products/:id", async (c) => c.json(await catalog.updateProduct(c.var.svc, c.req.param("id"), await body(c, productPatch))));
  api.post("/catalog/sync", async (c) => c.json(await catalog.syncCatalog(c.var.svc)));

  // Accounts
  api.get("/accounts", async (c) =>
    c.json(
      await accounts.listAccounts(c.var.svc, {
        kind: c.req.query("kind"),
        status: c.req.query("status"),
        institutionId: c.req.query("institutionId"),
        q: c.req.query("q"),
      }),
    ),
  );
  api.post("/accounts", async (c) => c.json(await accounts.createAccount(c.var.svc, await body(c, accountInput)), 201));
  api.get("/accounts/:id", async (c) => c.json(await accounts.getAccount(c.var.svc, c.req.param("id"))));
  api.patch("/accounts/:id", async (c) => c.json(await accounts.updateAccount(c.var.svc, c.req.param("id"), await body(c, accountPatch))));
  api.delete("/accounts/:id", async (c) => c.json(await accounts.deleteAccount(c.var.svc, c.req.param("id"))));

  // Events
  api.post("/accounts/:id/events", async (c) => c.json(await accounts.recordEvent(c.var.svc, c.req.param("id"), await body(c, eventInput)), 201));
  api.delete("/events/:id", async (c) => c.json(await accounts.deleteEvent(c.var.svc, c.req.param("id"))));

  // Bonuses
  api.get("/bonuses", async (c) => {
    const q = z
      .object({ status: z.array(z.enum(BONUS_STATUSES)).optional(), kind: z.enum(ACCOUNT_KINDS).optional() })
      .safeParse({ status: c.req.query("status")?.split(","), kind: c.req.query("kind") });
    if (!q.success) throw new BadRequestError("Invalid status or kind filter");
    return c.json(await bon.listBonuses(c.var.svc, { statuses: q.data.status, kind: q.data.kind }));
  });
  api.get("/bonuses/upcoming", async (c) => {
    const within = c.req.query("withinDays");
    return c.json(await bon.upcomingDeadlines(c.var.svc, { withinDays: within ? Number(within) : undefined }));
  });
  api.post("/accounts/:id/bonuses", async (c) => c.json(await bon.createBonus(c.var.svc, c.req.param("id"), await body(c, bonusInput)), 201));
  api.patch("/bonuses/:id", async (c) => c.json(await bon.updateBonus(c.var.svc, c.req.param("id"), await body(c, bonusPatch))));
  api.delete("/bonuses/:id", async (c) => c.json(await bon.deleteBonus(c.var.svc, c.req.param("id"))));

  // Benefits
  api.get("/benefits", async (c) =>
    c.json(await bon.listBenefits(c.var.svc, { accountId: c.req.query("accountId"), unusedOnly: c.req.query("unused") === "1" })),
  );
  api.post("/accounts/:id/benefits", async (c) => c.json(await bon.createBenefit(c.var.svc, c.req.param("id"), await body(c, benefitInput)), 201));
  api.patch("/benefits/:id", async (c) => c.json(await bon.updateBenefit(c.var.svc, c.req.param("id"), await body(c, benefitPatch))));
  api.delete("/benefits/:id", async (c) => c.json(await bon.deleteBenefit(c.var.svc, c.req.param("id"))));
  api.post("/benefits/:id/uses", async (c) => c.json(await bon.markBenefitUsed(c.var.svc, c.req.param("id"), await body(c, benefitUseInput)), 201));
  api.delete("/benefit-uses/:id", async (c) => c.json(await bon.deleteBenefitUse(c.var.svc, c.req.param("id"))));

  // Rules
  const ruleOpts = (c: Context) => ({
    asOf: asOfParam(c),
    countAuthorizedUsers: c.req.query("countAU") !== "0",
    conservative: c.req.query("precise") !== "1",
  });
  api.get("/eligibility", async (c) => c.json(await checkAllProducts(c.var.svc, ruleOpts(c))));
  api.get("/eligibility/five24", async (c) => c.json(await getFive24(c.var.svc, ruleOpts(c))));
  api.get("/eligibility/:productId", async (c) =>
    c.json(
      await checkProductEligibility(c.var.svc, c.req.param("productId"), ruleOpts(c)),
    ),
  );

  // Opportunities (机会)
  api.get("/opportunities", async (c) =>
    c.json(await offersSvc.listOpportunities(c.var.svc, { kind: c.req.query("kind"), includeArchived: c.req.query("archived") === "1", asOf: asOfParam(c) })),
  );
  api.post("/offers", async (c) => c.json(await offersSvc.createOffer(c.var.svc, await body(c, offerInput)), 201));
  api.patch("/offers/:id", async (c) => c.json(await offersSvc.updateOffer(c.var.svc, c.req.param("id"), await body(c, offerPatch))));
  api.delete("/offers/:id", async (c) => c.json(await offersSvc.deleteOffer(c.var.svc, c.req.param("id"))));
  api.post("/offers/:id/claim", async (c) => c.json(await offersSvc.claimOffer(c.var.svc, c.req.param("id"), await body(c, claimOfferInput)), 201));

  api.get("/dashboard", async (c) => c.json(await getDashboard(c.var.svc)));

  // Import (owner's real history arrives through here, never through git)
  api.post("/import", async (c) => {
    const dryRun = c.req.query("dryRun") === "1";
    const type = c.req.header("Content-Type") ?? "";
    let payload: unknown;
    if (type.includes("text/csv")) payload = csvToImportPayload(await c.req.text());
    else {
      try {
        payload = await c.req.json();
      } catch {
        throw new BadRequestError("Body must be JSON or text/csv");
      }
    }
    return c.json(await importHistory(c.var.svc, payload, { dryRun }));
  });

  api.all("*", (c) => c.json({ error: "Not found" }, 404));
  return api;
}
