import { describe, expect, it } from "vitest";

import { serverDeletionKeys } from "./constants";

describe("server deletion query keys", () => {
  it("preserves the status key", () => {
    expect(serverDeletionKeys.status("server")).toEqual([
      "server-deletion",
      "server",
    ]);
  });
});
