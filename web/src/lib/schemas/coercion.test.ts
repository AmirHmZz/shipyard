import { describe, expect, it } from "vitest";
import * as z from "zod/mini";

import { inputNumberSchema, portSchema, legacyPort } from "./coercion";

describe("numeric input coercion", () => {
  it.each(["", " "])("keeps native empty input conversion for %j", (value) => {
    expect(z.parse(inputNumberSchema, value)).toBe(0);
    expect(z.safeParse(portSchema, value).success).toBe(false);
  });
  it("rejects nonnumeric values and invalid ports", () => {
    for (const value of ["abc", "0", "65536", "2.5"]) {
      expect(z.safeParse(portSchema, value).success).toBe(false);
    }
    expect(z.safeParse(inputNumberSchema, "abc").success).toBe(false);
    expect(legacyPort(undefined)).toBeNaN();
  });
  it("accepts numeric strings and numbers", () => {
    expect(z.parse(portSchema, "8080")).toBe(8080);
    expect(z.parse(portSchema, 8080)).toBe(8080);
    expect(legacyPort("8080")).toBe(8080);
  });
});
