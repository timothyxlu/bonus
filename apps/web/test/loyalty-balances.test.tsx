// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { LoyaltyBalanceForm, LoyaltyBalances } from "../src/components/LoyaltyBalances";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const row = { id: "a", category: "flight" as const, program: "Alaska", balance: 83139, notes: null, createdAt: "", updatedAt: "" };

describe("loyalty balances UI", () => {
  it("renders the three responsive categories and add action", () => {
    const client = new QueryClient();
    client.setQueryData(["loyalty-balances"], [row]);
    const html = renderToStaticMarkup(<QueryClientProvider client={client}><LoyaltyBalances /></QueryClientProvider>);
    expect(html).toContain("lg:grid-cols-3");
    expect(html).toContain("items-start");
    expect(html).toContain("航空 / Flight");
    expect(html).toContain("酒店 / Hotel");
    expect(html).toContain("信用卡 / Credit Card");
    expect(html).toContain("添加余额");
    expect(html).toContain('aria-label="编辑 Alaska"');
    expect(html).toContain('title="编辑 Alaska"');
    expect(html).toContain('aria-label="删除 Alaska"');
    expect(html).toContain('title="删除 Alaska"');
    expect(html).toContain("sm:w-8");
    expect(html).not.toContain(">编辑</button>");
    expect(html).not.toContain(">删除</button>");
  });

  it("toggles the disclosure by click, Enter, and Space without the add button toggling it", () => {
    const client = new QueryClient();
    client.setQueryData(["loyalty-balances"], [row]);
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    act(() => root.render(<QueryClientProvider client={client}><LoyaltyBalances /></QueryClientProvider>));

    const disclosure = host.querySelector<HTMLButtonElement>('button[aria-controls^="loyalty-balances-"]')!;
    const content = document.getElementById(disclosure.getAttribute("aria-controls")!)!;
    const add = host.querySelector<HTMLButtonElement>('button[aria-label="添加余额"]')!;
    // Collapsed by default.
    expect(disclosure.getAttribute("aria-expanded")).toBe("false");
    expect(disclosure.getAttribute("aria-label")).toBe("展开积分余额");
    expect(content.hidden).toBe(true);

    act(() => add.click());
    expect(disclosure.getAttribute("aria-expanded")).toBe("false");
    expect(host.querySelector('[role="dialog"]')).not.toBeNull();

    act(() => disclosure.click());
    expect(disclosure.getAttribute("aria-expanded")).toBe("true");
    expect(disclosure.getAttribute("aria-label")).toBe("收起积分余额");
    expect(content.hidden).toBe(false);
    act(() => disclosure.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true })));
    expect(disclosure.getAttribute("aria-expanded")).toBe("false");
    act(() => disclosure.dispatchEvent(new KeyboardEvent("keydown", { key: " ", bubbles: true, cancelable: true })));
    expect(disclosure.getAttribute("aria-expanded")).toBe("true");

    act(() => root.unmount());
    host.remove();
  });

  it("renders editable category, program, integer balance and notes fields", () => {
    const client = new QueryClient();
    const html = renderToStaticMarkup(<QueryClientProvider client={client}><LoyaltyBalanceForm initial={row} onDone={() => {}} /></QueryClientProvider>);
    expect(html).toContain('value="Alaska"');
    expect(html).toContain('value="83139"');
    expect(html).toContain('step="1"');
    expect(html).toContain('min="0"');
  });
});
