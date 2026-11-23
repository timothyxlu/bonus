import { listBenefits, upcomingDeadlines } from "./bonuses";
import type { ServiceContext } from "./context";
import { getFive24 } from "./eligibility";
import { listAccounts } from "./accounts";

export async function getDashboard(ctx: ServiceContext) {
  const [five24, deadlines, unusedBenefits, accts] = await Promise.all([
    getFive24(ctx),
    upcomingDeadlines(ctx, { limit: 8 }),
    listBenefits(ctx, { unusedOnly: true }),
    listAccounts(ctx),
  ]);
  const open = accts.filter((a) => a.status === "open");
  return {
    today: ctx.today,
    five24,
    deadlines,
    unusedBenefits,
    stats: {
      openAccounts: open.length,
      totalAccounts: accts.length,
      annualFees: open.reduce((s, a) => s + (a.annualFee ?? 0), 0),
      activeBonuses: deadlines.filter((d) => d.active).length,
    },
  };
}
