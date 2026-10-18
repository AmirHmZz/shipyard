import { describe, expect, it } from "vitest";
import { teamKeys } from "./constants";

describe("team query keys", () => {
  it("preserves the optional team entry", () => {
    expect(teamKeys.members(undefined)).toEqual(["members", undefined]);
    expect(teamKeys.members("team")).toEqual(["members", "team"]);
  });
});
