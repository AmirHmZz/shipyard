import { describe, expect, it } from "vitest";

import { authFormSchema } from "./schema";
describe("dashboard form validation", () => {
  it("applies the appropriate auth requirements", () => {
    expect(
      authFormSchema("login").safeParse({
        email: "bad",
        password: "x",
        name: "",
        code: "",
        token: "",
      }).success,
    ).toBe(false);
    expect(
      authFormSchema("setup").safeParse({
        email: "admin@example.com",
        password: "short",
        name: "Admin",
        code: "",
        token: "token",
      }).success,
    ).toBe(false);
    expect(
      authFormSchema("accept").safeParse({
        email: "",
        password: "current",
        name: "New User",
        code: "",
        token: "invite",
      }).success,
    ).toBe(true);
  });
});
