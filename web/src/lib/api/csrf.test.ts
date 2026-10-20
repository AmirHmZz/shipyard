import { beforeEach, expect, it } from "vitest";

import { captureSession, getCSRF, setCSRF } from "./csrf";
beforeEach(() => setCSRF("old-token"));
const session = {
  user: {
    id: "u",
    name: "U",
    email: "u@example.test",
    admin: false,
    totp: false,
  },
  csrf: "new-token",
};
it.each([
  "/auth/me",
  "/auth/login",
  "/auth/setup",
  "/auth/accept",
  "/auth/password",
])("captures a validated session from %s", (path) => {
  captureSession(path, session);
  expect(getCSRF()).toBe("new-token");
});
it("ignores incomplete sessions and unrelated payloads", () => {
  captureSession("/auth/me", { csrf: "unvalidated" });
  captureSession("/resources", session);
  expect(getCSRF()).toBe("old-token");
});
it("clears the token after successful logout", () => {
  captureSession("/auth/logout", { ok: true });
  expect(getCSRF()).toBe("");
});
