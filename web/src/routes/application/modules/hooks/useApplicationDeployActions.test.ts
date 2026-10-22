// @vitest-environment jsdom

import { renderHook } from "@testing-library/react";
import { expect, it, vi } from "vitest";

import type { Resource } from "@/lib/api/types";

import { useApplicationDeployActions } from "./useApplicationDeployActions";

const app: Resource = {
  id: "app",
  kind: "application",
  name: "App",
  parentId: "env",
  teamId: "team",
  version: 1,
  data: { source: "compose" },
  variables: {},
  secretKeys: [],
  canWrite: true,
  createdAt: "",
  updatedAt: "",
};
function options(status: string, releaseId?: string) {
  return {
    app,
    runtime: { status, releaseId },
    busy: false,
    deploy: vi.fn(),
    resetDeploy: vi.fn(),
    onAction: vi.fn(),
    onDelete: vi.fn(),
    deployError: "",
  };
}

it("allows Stop after a failed first deployment and disables controls until Stop finishes", () => {
  const { result, rerender } = renderHook(useApplicationDeployActions, {
    initialProps: options("not_deployed"),
  });
  expect(result.current.derived.canStop).toBe(true);
  expect(result.current.derived.canControl).toBe(false);
  rerender(options("stopping"));
  expect(result.current.derived.canStop).toBe(false);
  expect(result.current.derived.canDeploy).toBe(false);
  rerender(options("stopped"));
  expect(result.current.derived.stopped).toBe(true);
  expect(result.current.derived.canControl).toBe(false);
  expect(result.current.derived.canDeploy).toBe(true);
});
