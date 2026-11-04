import { expect, it } from "vitest";

import { ApiException } from "@/lib/api/errors";
import { API_ERROR_MESSAGES } from "@/lib/constants";

import { describeAuthError } from "./describeAuthError";

it("preserves credential guidance inline while other failures use the shared translator", () => {
  expect(
    describeAuthError(
      new ApiException({
        kind: "http",
        status: 401,
        path: "/auth/login",
        message: "Invalid credentials",
      }),
    ),
  ).toBe("Invalid credentials");
  expect(
    describeAuthError(
      new ApiException({
        kind: "network",
        path: "/auth/login",
        cause: new Error("offline"),
      }),
    ),
  ).toBe(API_ERROR_MESSAGES.network);
  expect(describeAuthError(null)).toBe("");
});

it.each([
  "Use your existing account password and enter an authenticator or recovery code if two-factor authentication is enabled",
  "Account is disabled; contact a platform administrator",
  "Origin is not allowed",
])("shows the invitation rejection inline: %s", (message) => {
  expect(
    describeAuthError(
      new ApiException({
        kind: "http",
        status: 403,
        path: "/auth/accept",
        message,
      }),
    ),
  ).toBe(message);
});
