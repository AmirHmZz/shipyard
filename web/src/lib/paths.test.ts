import { describe, expect, it } from "vitest";

import { apiPath } from "./paths";

describe("apiPath", () => {
  it("encodes each interpolated identifier", () => {
    expect(apiPath`/zones/${"a/b"}/records/${"x y?"}`).toBe(
      "/zones/a%2Fb/records/x%20y%3F",
    );
  });

  it("preserves literal separators and normal identifiers", () => {
    expect(apiPath`/zones/${"zone-1"}/records/${42}`).toBe(
      "/zones/zone-1/records/42",
    );
  });
});
