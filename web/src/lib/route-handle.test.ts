import { describe, expect, it } from "vitest";

import { resolvePageLabel, type RouteHandle } from "./route-handle";

const configuration: RouteHandle = {
  pageLabel: (params) =>
    params.id === "new"
      ? `New ${(params.kind || "").replaceAll("-", " ")}`
      : "Configuration",
};
describe("leaf page labels and sidebar fallback", () => {
  it.each([
    ["/", undefined, {}, undefined, "Overview"],
    [
      "/applications/x",
      { pageLabel: "Applications" },
      { id: "x" },
      undefined,
      "Applications",
    ],
    [
      "/configure/server/new",
      configuration,
      { kind: "server", id: "new" },
      undefined,
      "New server",
    ],
    [
      "/configure/network/abc",
      configuration,
      { kind: "network", id: "abc" },
      undefined,
      "Configuration",
    ],
    [
      "/configure/new-thing/new",
      configuration,
      { kind: "new-thing", id: "new" },
      undefined,
      "New new thing",
    ],
    ["/unknown", undefined, {}, undefined, "Overview"],
    ["/projects", undefined, {}, "Projects", "Projects"],
    ["/configure//new", configuration, { id: "new" }, undefined, "New "],
  ] as const)("%s", (_path, handle, params, section, expected) => {
    const matches = [
      { handle: { pageLabel: "Parent must not leak" }, params: {} },
      { handle, params },
    ];
    expect(section || resolvePageLabel(matches) || "Overview").toBe(expected);
  });
  it("returns undefined for no matches or an unlabelled leaf", () => {
    expect(resolvePageLabel([])).toBeUndefined();
    expect(resolvePageLabel([{ params: {} }])).toBeUndefined();
  });
});
