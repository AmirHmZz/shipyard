import { describe, expect, it } from "vitest";

import { dnsRecordFormSchema } from "./schema";
describe("dashboard form validation", () => {
  it("preserves unknown DNS record fields", () => {
    const record = {
      type: "A",
      name: "example.com",
      content: "192.0.2.1",
      ttl: 120,
      providerOptions: { flattened: true },
    };
    expect(dnsRecordFormSchema.parse(record)).toEqual(record);
  });
  it("keeps the DNS TTL validation message", () => {
    const result = dnsRecordFormSchema.safeParse({
      type: "A",
      name: "example.com",
      content: "192.0.2.1",
      ttl: 0,
    });
    expect(result.error?.issues.map((issue) => issue.message)).toEqual([
      "TTL must be positive.",
    ]);
  });
  it("rejects invalid DNS records, invitation emails, and commit SHAs (dns)", () => {
    expect(
      dnsRecordFormSchema.safeParse({
        type: "A",
        name: "example.com",
        content: "",
        ttl: 120,
      }).success,
    ).toBe(false);
  });
});
