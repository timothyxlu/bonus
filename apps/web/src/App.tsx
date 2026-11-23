import { Layout } from "./components/Layout";
import { useRouter } from "./lib/router";
import { AccountsPage } from "./pages/Accounts";
import { BenefitsPage } from "./pages/Benefits";
import { DashboardPage } from "./pages/Dashboard";
import { EligibilityPage } from "./pages/Eligibility";
import { SettingsPage } from "./pages/Settings";

export function App() {
  const { path } = useRouter();
  let page;
  if (path === "/" || path === "") page = <DashboardPage />;
  else if (path.startsWith("/accounts")) page = <AccountsPage />;
  else if (path.startsWith("/benefits")) page = <BenefitsPage />;
  else if (path.startsWith("/eligibility")) page = <EligibilityPage />;
  else if (path.startsWith("/settings")) page = <SettingsPage />;
  else page = <DashboardPage />;
  return <Layout>{page}</Layout>;
}
