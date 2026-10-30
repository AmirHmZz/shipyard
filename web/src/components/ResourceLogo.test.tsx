// @vitest-environment jsdom
import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";

import type { Resource } from "@/lib/api/types";

import { ResourceLogo } from "./ResourceLogo";

afterEach(cleanup);

it("falls back after image failure and retries a replacement URL", () => {
  const resource: Resource = {
    id: "p",
    name: "Project",
    kind: "project",
    teamId: "t",
    parentId: "t",
    data: {},
    secretKeys: [],
    variables: {},
    canWrite: true,
    version: 1,
    createdAt: "",
    updatedAt: "",
    logoUrl: "/logo?v=1",
  };
  const view = render(<ResourceLogo resource={resource} />);
  const image = view.container.querySelector("img");
  expect(image).not.toBeNull();
  if (!image) throw new Error("Logo not rendered");
  fireEvent.error(image);
  expect(view.container.querySelector("img")).toBeNull();
  expect(view.container.querySelector("svg")).not.toBeNull();
  view.rerender(
    <ResourceLogo resource={{ ...resource, logoUrl: "/logo?v=2" }} />,
  );
  expect(view.container.querySelector("img")?.getAttribute("src")).toBe(
    "/logo?v=2",
  );
});
