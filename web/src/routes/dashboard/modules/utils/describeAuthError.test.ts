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
