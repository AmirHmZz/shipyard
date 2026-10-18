import { describe, expect, it } from "vitest";
import { configurationKeys } from "./constants";

describe("configuration query keys", () => {
  it("preserves each original shape", () => {
    expect(configurationKeys.haproxy("server")).toEqual(["haproxy", "server"]);
    expect(configurationKeys.gitSetup(undefined)).toEqual([
      "git-setup",
      undefined,
    ]);
    expect(configurationKeys.gitSetupConfig).toEqual(["git-setup-config"]);
    expect(configurationKeys.giteaInstances).toEqual(["gitea-instances"]);
  });
});
