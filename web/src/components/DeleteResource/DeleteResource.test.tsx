// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import type { Resource } from "@/lib/api/types";

import { createTestClient, renderWithClient } from "@/test/renderWithClient";

import { DeleteResource } from "./DeleteResource";

const resource: Resource = {
  id: "same-id",
  kind: "application",
  name: "Backend",
  version: 1,
  teamId: "team",
  parentId: "env",
  data: {},
  secretKeys: [],
  variables: {},
  canWrite: true,
  createdAt: "",
  updatedAt: "",
};
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it("resets confirmation after a rename and retains permission checks", () => {
  const client = createTestClient();
  const props = { resource, onClose: vi.fn(), onDeleted: vi.fn() };
  const view = render(<DeleteResource {...props} />, renderWithClient(client));
  fireEvent.change(screen.getByLabelText("Type Backend to confirm"), {
    target: { value: "Backend" },
  });
  expect(
    screen
      .getByRole("button", { name: "Delete application" })
      .hasAttribute("disabled"),
  ).toBe(false);
  view.rerender(
    <DeleteResource {...props} resource={{ ...resource, name: "Backend 2" }} />,
  );
  view.rerender(<DeleteResource {...props} resource={resource} />);
  expect(
    screen.getByLabelText("Type Backend to confirm").getAttribute("value"),
  ).toBe("");
  view.rerender(
    <DeleteResource {...props} resource={{ ...resource, name: "Backend 2" }} />,
  );
  const input = screen.getByLabelText("Type Backend 2 to confirm");
  expect(input.getAttribute("value")).toBe("");
  fireEvent.change(input, { target: { value: " Backend\u00a02 " } });
  expect(
    screen
      .getByRole("button", { name: "Delete application" })
      .hasAttribute("disabled"),
  ).toBe(false);
  view.rerender(
    <DeleteResource
      {...props}
      resource={{ ...resource, name: "Backend 2", canWrite: false }}
    />,
  );
  expect(
    screen
      .getByRole("button", { name: "Delete application" })
      .hasAttribute("disabled"),
  ).toBe(true);
  client.clear();
});

it("keeps the dialog open and displays failed deletion requests", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: "Cleanup unavailable" }), {
        status: 409,
      }),
    ),
  );
  const client = createTestClient();
  const onClose = vi.fn();
  const onDeleted = vi.fn();
  render(
    <DeleteResource
      resource={resource}
      onClose={onClose}
      onDeleted={onDeleted}
    />,
    renderWithClient(client),
  );
  fireEvent.change(screen.getByLabelText("Type Backend to confirm"), {
    target: { value: "Backend" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Delete application" }));
  await waitFor(() =>
    expect(screen.getByRole("alert").textContent).toContain(
      "Cleanup unavailable",
    ),
  );
  expect(onClose).not.toHaveBeenCalled();
  expect(onDeleted).not.toHaveBeenCalled();
  client.clear();
});
