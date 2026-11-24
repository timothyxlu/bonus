import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CertificateUnusedFilter } from "../src/pages/Benefits";
import { hotelCertificatesPath, hotelCertificatesQueryKey } from "../src/lib/queries";

describe("hotel certificate unused filter", () => {
  it("uses a distinct cached API query for unused certificates", () => {
    expect(hotelCertificatesPath(undefined)).toBe("/hotel-certificates");
    expect(hotelCertificatesPath("unused")).toBe("/hotel-certificates?status=unused");
    expect(hotelCertificatesQueryKey(undefined)).toEqual(["hotel-certificates", "all"]);
    expect(hotelCertificatesQueryKey("unused")).toEqual(["hotel-certificates", "unused"]);
  });

  it("renders the analogous checked 只看未用 control with counts", () => {
    const html = renderToStaticMarkup(
      <CertificateUnusedFilter checked unusedCount={2} totalCount={4} onChange={() => undefined} />,
    );
    expect(html).toContain('type="checkbox"');
    expect(html).toContain("checked");
    expect(html).toContain("只看未用 (2/4)");
  });
});
