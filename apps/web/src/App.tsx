import { Layout } from "./components/Layout";
import { useRouter } from "./lib/router";
import { AccountsPage } from "./pages/Accounts";
import { BenefitsPage } from "./pages/Benefits";
import { BonusesPage } from "./pages/Bonuses";
import { MorePage } from "./pages/More";
import { OpportunitiesPage } from "./pages/Opportunities";
import { DashboardPage } from "./pages/Dashboard";
import { EligibilityPage } from "./pages/Eligibility";
import { SettingsPage } from "./pages/Settings";

export function App() {
  const { path } = useRouter();
  let page;
  if (path === "/" || path === "") page = <DashboardPage />;
  else if (path.startsWith("/accounts")) page = <AccountsPage />;
  else if (path.startsWith("/opportunities")) page = <OpportunitiesPage />;
  else if (path.startsWith("/bonuses")) page = <BonusesPage />;
  else if (path.startsWith("/benefits")) page = <BenefitsPage />;
  else if (path.startsWith("/more")) page = <MorePage />;
  else if (path.startsWith("/eligibility")) page = <EligibilityPage />;
  else if (path.startsWith("/settings")) page = <SettingsPage />;
  else page = <DashboardPage />;
  return <Layout>{page}</Layout>;
}
