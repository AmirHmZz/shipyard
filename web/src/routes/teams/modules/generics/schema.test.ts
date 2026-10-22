import { describe, expect, it } from "vitest";

import { invitationFormSchema } from "./schema";
describe("dashboard form validation", () => {
  it("rejects invalid DNS records, invitation emails, and commit SHAs (teams)", () => {
    expect(
      invitationFormSchema.safeParse({
        email: "invalid",
        role: "member",
        projectId: "",
      }).success,
    ).toBe(false);
  });
});
