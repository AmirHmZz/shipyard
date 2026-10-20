import { describe, expect, it } from "vitest";
import * as z from "zod/mini";

import { API_ERROR_MESSAGES } from "@/lib/constants";

import type { ApiError } from "./errors";

import { ApiException } from "./errors";
import {
  describeError,
  translateApiError,
  translateIssues,
} from "./translate-error";

const cases: [ApiError, string][] = [
  [{ kind: "aborted", path: "/x" }, ""],
  [
    { kind: "network", path: "/x", cause: new Error("offline") },
    API_ERROR_MESSAGES.network,
  ],
  [{ kind: "parse", path: "/x" }, API_ERROR_MESSAGES.unexpected],
  [{ kind: "schema", path: "/x", issues: [] }, API_ERROR_MESSAGES.unexpected],
  [
    { kind: "http", path: "/x", status: 401, message: "Unauthorized" },
    API_ERROR_MESSAGES.unauthorized,
  ],
  [
    { kind: "http", path: "/x", status: 403, message: "Forbidden" },
    API_ERROR_MESSAGES.forbidden,
  ],
  [
    { kind: "http", path: "/x", status: 500, message: "" },
    API_ERROR_MESSAGES.server,
  ],
  [
    { kind: "http", path: "/x", status: 400, message: "" },
    API_ERROR_MESSAGES.failed,
  ],
];
describe("pure error copy", () => {
  it.each(cases)("translates %j", (error, message) => {
    expect(translateApiError(error)).toBe(message);
  });
  it.each([400, 404, 409, 422, 500, 502])(
    "preserves the server message for %i",
    (status) => {
      expect(
        translateApiError({
          kind: "http",
          path: "/x",
          status,
          message: "Actionable detail",
        }),
      ).toBe("Actionable detail");
    },
  );
  it("describes structured and ordinary errors", () => {
    expect(describeError(new ApiException({ kind: "parse", path: "/x" }))).toBe(
      API_ERROR_MESSAGES.unexpected,
    );
    expect(describeError(new Error("Keep this"))).toBe("Keep this");
    expect(describeError(null)).toBe(API_ERROR_MESSAGES.failed);
  });
  it("uses the same issue text for form validation and error states", () => {
    const result = z.safeParse(
      z.string().check(z.minLength(1, "Required.")),
      "",
    );
    if (result.success) throw new Error("Expected invalid input");
    expect(translateIssues(result.error.issues)).toBe("Required.");
    expect(describeError(result.error)).toBe("Required.");
  });
});
