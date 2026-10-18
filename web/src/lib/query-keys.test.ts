import { describe, expect, it } from "vitest";
import {
  applicationServiceKeys,
  branchKeys,
  deploymentKeys,
  dockerNetworkKeys,
  grantKeys,
  metricsKeys,
  providerZoneKeys,
  repositoryKeys,
  resourceKeys,
  sessionKeys,
} from "./query-keys";

describe("shared query keys", () => {
  it("preserves prefix and undefined entries", () => {
    expect(resourceKeys.all).toEqual(["resources"]);
    expect(sessionKeys.all).toEqual(["session"]);
    expect(deploymentKeys.all).toEqual(["deployments"]);
    expect(deploymentKeys.list(undefined)).toEqual(["deployments", undefined]);
    expect(deploymentKeys.list("app")).toEqual(["deployments", "app"]);
    expect(metricsKeys.all).toEqual(["metrics"]);
    expect(metricsKeys.server("server")).toEqual(["metrics", "server"]);
    expect(dockerNetworkKeys.all).toEqual(["docker-networks"]);
    expect(dockerNetworkKeys.filter("filter")).toEqual([
      "docker-networks",
      "filter",
    ]);
    expect(dockerNetworkKeys.server("server")).toEqual([
      "docker-networks",
      "server",
    ]);
  });

  it("preserves shared option and grant keys", () => {
    expect(applicationServiceKeys.parent("app")).toEqual([
      "application-services",
      "app",
    ]);
    expect(applicationServiceKeys.version("app", 2)).toEqual([
      "application-services",
      "app",
      2,
    ]);
    expect(providerZoneKeys.parent("provider")).toEqual([
      "provider-zones",
      "provider",
    ]);
    expect(repositoryKeys.git("git")).toEqual(["repositories", "git"]);
    expect(branchKeys.repository("git", "org/repo")).toEqual([
      "branches",
      "git",
      "org/repo",
    ]);
    expect(grantKeys.resource("resource")).toEqual(["grants", "resource"]);
  });
});
