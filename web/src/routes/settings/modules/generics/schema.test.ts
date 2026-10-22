import { describe, expect, it } from "vitest";

import { passwordFormSchema } from "./schema";
describe("dashboard form validation", () => {
  it("preserves credential bytes across local validation (settings)", () => {
    expect(
      passwordFormSchema.parse({
        current: " current ",
        password: "new-password",
        code: "",
      }).current,
    ).toBe(" current ");
  });
});
