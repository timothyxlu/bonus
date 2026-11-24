import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { LoyaltyBalanceForm, LoyaltyBalances } from "../src/components/LoyaltyBalances";

describe("loyalty balances UI", () => {
  it("renders the three responsive categories and add action", () => {
    const client = new QueryClient();
    client.setQueryData(["loyalty-balances"], []);
    const html = renderToStaticMarkup(<QueryClientProvider client={client}><LoyaltyBalances /></QueryClientProvider>);
    expect(html).toContain("lg:grid-cols-3");
    expect(html).toContain("航空 / Flight");
    expect(html).toContain("酒店 / Hotel");
    expect(html).toContain("信用卡 / Credit Card");
    expect(html).toContain("添加余额");
  });

  it("renders editable category, program, integer balance and notes fields", () => {
    const client = new QueryClient();
    const initial = { id: "a", category: "flight" as const, program: "Alaska", balance: 83139, notes: null, createdAt: "", updatedAt: "" };
    const html = renderToStaticMarkup(<QueryClientProvider client={client}><LoyaltyBalanceForm initial={initial} onDone={() => {}} /></QueryClientProvider>);
    expect(html).toContain('value="Alaska"');
    expect(html).toContain('value="83139"');
    expect(html).toContain('step="1"');
    expect(html).toContain('min="0"');
  });
});
