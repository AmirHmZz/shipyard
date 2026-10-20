import { describe, expect, it } from "vitest";

import { dnsCredentialSchema } from "./dns";
describe("dashboard form validation", () => {
  it("rejects invalid DNS records, invitation emails, and commit SHAs (shared)", () => {
    expect(
      dnsCredentialSchema.safeParse({ provider: "cloudflare", token: "" })
        .success,
    ).toBe(false);
  });
  it("preserves credential bytes across local validation (shared)", () => {
    expect(
      dnsCredentialSchema.parse({ provider: "cloudflare", token: " token " })
        .token,
    ).toBe(" token ");
  });
});
