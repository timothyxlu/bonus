import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { OwnerTypeFilter } from "../src/components/OwnerTypeFilter";

describe("owner type filter", () => {
  it("renders all, personal, and business as an accessible segmented control", () => {
    const html = renderToStaticMarkup(<OwnerTypeFilter value="personal" onChange={() => undefined} />);
    expect(html).toContain('role="group"');
    expect(html).toContain("全部");
    expect(html).toContain("个人");
    expect(html).toContain("商业");
    expect(html).toContain('aria-pressed="true"');
  });
});
