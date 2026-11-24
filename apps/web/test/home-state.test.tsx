// @vitest-environment jsdom
import { US_STATES } from "@bonus/core";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HomeStateCard } from "../src/pages/Settings";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
// jsdom has no layout; the listbox scrolls its active option into view.
Element.prototype.scrollIntoView ??= () => {};

/** A tiny stand-in for the worker: the stored preference lives "server side", not in the page. */
let stored: string | null;
let failNextPatch: boolean;
let patches: unknown[];
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

beforeEach(() => {
  stored = null;
  failNextPatch = false;
  patches = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      expect(url).toBe("/api/preferences");
      if (!init?.method || init.method === "GET") return json(200, { homeState: stored, updatedAt: stored ? "2026-11-24T00:00:00.000Z" : null });
      const body = JSON.parse(String(init.body));
      patches.push(body);
      if (failNextPatch) {
        failNextPatch = false;
        return json(400, { error: "homeState must be a two-letter U.S. state code (50 states or DC) or null" });
      }
      stored = body.homeState;
      return json(200, { homeState: stored, updatedAt: "2026-11-24T00:00:00.000Z" });
    }),
  );
});

let mounted: { root: Root; host: HTMLElement }[] = [];
afterEach(() => {
  for (const { root, host } of mounted) {
    act(() => root.unmount());
    host.remove();
  }
  mounted = [];
  vi.unstubAllGlobals();
});

/** Mounts the card with a brand-new query cache, like a reload or another device. */
async function mount() {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  mounted.push({ root, host });
  await act(async () => root.render(<QueryClientProvider client={client}><HomeStateCard /></QueryClientProvider>));
  await settle();
  const combobox = host.querySelector<HTMLButtonElement>('button[role="combobox"]')!;
  return { host, combobox };
}
const settle = () => act(async () => { for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0)); });
const shown = (combobox: HTMLElement) => combobox.querySelector('span[aria-hidden="false"]')?.textContent;
async function choose(combobox: HTMLButtonElement, label: string) {
  act(() => combobox.click());
  const option = [...document.querySelectorAll<HTMLElement>('[role="option"]')].find((o) => o.textContent === label);
  expect(option, label).toBeTruthy();
  act(() => option!.click());
  await settle();
}

describe("Settings: U.S. state", () => {
  it("offers Not set plus all 50 states and DC with readable names, labelled and described", async () => {
    const { host, combobox } = await mount();
    const label = host.querySelector("label")!;
    expect(label.htmlFor).toBe(combobox.id);
    expect(label.textContent).toContain("U.S. state");
    expect(document.getElementById(combobox.getAttribute("aria-describedby")!)?.textContent).toContain("换设备");
    expect(shown(combobox)).toBe("未设置 / Not set");
    expect(combobox.disabled).toBe(false);

    const native = host.querySelector<HTMLSelectElement>('select[name="homeState"]')!;
    const values = [...native.options].map((o) => o.value);
    expect(values).toEqual(["", ...US_STATES.map((s) => s.code)]);
    expect(values).toHaveLength(52);
    expect([...native.options].find((o) => o.value === "DC")?.textContent).toBe("District of Columbia (DC)");
    // Stays usable on narrow screens.
    expect(combobox.parentElement!.className).toContain("w-full min-w-0");
  });

  it("saves the canonical code to the server and restores it on a fresh load", async () => {
    const first = await mount();
    await choose(first.combobox, "California (CA)");
    expect(patches).toEqual([{ homeState: "CA" }]);
    expect(stored).toBe("CA");
    expect(shown(first.combobox)).toBe("California (CA)");
    expect(first.host.querySelector('[role="status"]')?.textContent).toBe("已保存：California");

    // New cache, nothing carried over in the page: value comes back from the server.
    const second = await mount();
    expect(shown(second.combobox)).toBe("California (CA)");
  });

  it("clears the state with Not set", async () => {
    stored = "NY";
    const { host, combobox } = await mount();
    expect(shown(combobox)).toBe("New York (NY)");
    await choose(combobox, "未设置 / Not set");
    expect(patches).toEqual([{ homeState: null }]);
    expect(stored).toBeNull();
    expect(shown(combobox)).toBe("未设置 / Not set");
    expect(host.querySelector('[role="status"]')?.textContent).toBe("已清除所在州");
    expect(shown((await mount()).combobox)).toBe("未设置 / Not set");
  });

  it("shows the server error and keeps the saved value when a save fails", async () => {
    stored = "TX";
    failNextPatch = true;
    const { host, combobox } = await mount();
    await choose(combobox, "Ohio (OH)");
    expect(host.querySelector('[role="alert"]')?.textContent).toContain("two-letter U.S. state code");
    expect(stored).toBe("TX");
    expect(shown(combobox)).toBe("Texas (TX)");
    expect(host.querySelector('[role="status"]')?.textContent).toBe("");
  });
});
