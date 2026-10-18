import { describe, expect, it } from "vitest";
import { dnsKeys } from "./constants";

describe("DNS query keys", () => {
  it("preserves each original shape", () => {
    expect(dnsKeys.records("zone")).toEqual(["records", "zone"]);
    expect(dnsKeys.certificates("zone")).toEqual(["zone-certificates", "zone"]);
  });
});
