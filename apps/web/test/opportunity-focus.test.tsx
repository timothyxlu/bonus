// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import { RouterProvider } from "../src/lib/router";
import type { Opportunity } from "../src/lib/types";
import { OpportunitiesPage } from "../src/pages/Opportunities";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const offer = (id: string, title: string, netUsd: number): Opportunity => ({
  id,
  kind: "bank_account",
  productId: null,
  productName: null,
  institutionId: "chase",
  institutionName: "Chase",
  currency: null,
  title,
  rewardAmount: netUsd,
  rewardUnit: "USD",
  centsPerPoint: null,
  estValueUsd: null,
  requirementType: "deposit",
  amountRequired: 1000,
  windowMonths: null,
  annualFee: null,
  feeWaivedFirstYear: false,
  otherCost: null,
  cooldownMonths: null,
  steps: [],
  expiresAt: null,
  sourceUrl: null,
  notes: null,
  status: "active",
  expired: false,
  updatedAt: "",
  value: { grossUsd: netUsd, costUsd: 0, netUsd, centsPerPoint: 100, returnOnRequired: netUsd / 1000 },
  eligibility: { status: "eligible", reasons: [] },
} as Opportunity);

describe("opportunity focus from the dashboard", () => {
  it("scrolls to and highlights the offer named in ?focus, then drops the parameter", () => {
    const scrolled: string[] = [];
    Element.prototype.scrollIntoView = vi.fn(function (this: Element) {
      scrolled.push(this.id);
    });
    window.history.pushState(null, "", "/opportunities?focus=b");
    const client = new QueryClient();
    client.setQueryData(["opportunities", false], [offer("a", "First", 500), offer("b", "Second", 300)]);
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    act(() =>
      root.render(
        <QueryClientProvider client={client}>
          <RouterProvider>
            <OpportunitiesPage />
          </RouterProvider>
        </QueryClientProvider>,
      ),
    );

    expect(scrolled).toEqual(["opp-b"]);
    const row = document.getElementById("opp-b")!;
    expect(document.activeElement).toBe(row);
    expect(row.className).toContain("ring-brand");
    expect(document.getElementById("opp-a")!.className).not.toContain("ring-brand");
    expect(window.location.search).toBe("");

    act(() => root.unmount());
    host.remove();
  });
});
