import { describe, expect, it } from "vitest";
import { isUsStateCode, US_STATE_CODES, US_STATES, usStateName } from "../src";

describe("U.S. states", () => {
  it("lists all 50 states plus DC with unique canonical codes", () => {
    expect(US_STATES).toHaveLength(51);
    expect(new Set(US_STATE_CODES).size).toBe(51);
    expect(US_STATE_CODES).toContain("DC");
    for (const code of US_STATE_CODES) expect(code).toMatch(/^[A-Z]{2}$/);
  });

  it("only accepts canonical two-letter abbreviations", () => {
    expect(isUsStateCode("CA")).toBe(true);
    expect(isUsStateCode("DC")).toBe(true);
    for (const bad of ["ca", "PR", "GU", "California", "", " CA", null, undefined, 12]) expect(isUsStateCode(bad)).toBe(false);
  });

  it("maps codes to readable names", () => {
    expect(usStateName("NY")).toBe("New York");
    expect(usStateName("DC")).toBe("District of Columbia");
    expect(usStateName(null)).toBeNull();
    expect(usStateName("XX")).toBeNull();
  });
});
