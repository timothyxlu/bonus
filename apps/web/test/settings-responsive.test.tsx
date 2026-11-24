import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ImportCard } from "../src/pages/Settings";

describe("settings import card", () => {
  it("allows import controls to shrink and stack on narrow screens", () => {
    const html = renderToStaticMarkup(
      <QueryClientProvider client={new QueryClient()}>
        <ImportCard />
      </QueryClientProvider>,
    );

    expect(html).toContain("grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_6rem]");
    expect(html).toMatch(/type="file"[^>]*class="[^"]*w-full min-w-0/);
    expect(html).toMatch(/role="combobox"/);
    expect(html).toMatch(/textarea[^>]*class="[^"]*min-w-0/);
    expect(html).toContain("flex flex-wrap justify-end gap-2");
  });
});
