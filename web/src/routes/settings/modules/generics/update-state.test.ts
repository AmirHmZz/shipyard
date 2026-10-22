import { expect, it } from "vitest";

import { initialUpdateState, updateReducer } from "./update-state";

it("requires fresh consent and backup credentials whenever the selected version changes", () => {
  const approved = {
    ...initialUpdateState,
    target: "1.0.0",
    reviewOpen: true,
    pass: "backup-test-passphrase",
    confirm: "1.0.0",
    approve: true,
  };
  expect(
    updateReducer(approved, { type: "target_changed", value: "0.9.0" }),
  ).toEqual({ ...initialUpdateState, target: "0.9.0" });
  expect(updateReducer(approved, { type: "preview_succeeded" })).toMatchObject({
    reviewOpen: true,
    pass: approved.pass,
    confirm: "",
    approve: false,
  });
  expect(updateReducer(approved, { type: "applied" })).toMatchObject({
    reviewOpen: false,
    pass: "",
  });
});
