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

import { TooltipProvider } from "@/components/ui/tooltip";
import { contractFixtures } from "@/test/api-contract-fixtures";
import { createTestClient, renderWithClient } from "@/test/renderWithClient";

import { applicationKeys } from "../generics";
import { RouteCard } from "./RouteCard";

const route: Resource = {
  id: "route-1",
  kind: "route",
  name: "app.example.com",
  parentId: "app",
  teamId: "team",
  data: { domain: "app.example.com", protocol: "https" },
  canWrite: true,
  version: 1,
  variables: {},
  secretKeys: [],
  createdAt: "",
  updatedAt: "",
};
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it("shows real ready states and DNS conflict actions", async () => {
  const ready = contractFixtures("DomainState").find(
    (fixture) => fixture.name === "route-ready",
  )?.body;
  const conflict = contractFixtures("DomainState").find(
    (fixture) => fixture.name === "route-conflict",
  )?.body;
  const fetch = vi
    .fn()
    .mockResolvedValueOnce(new Response(JSON.stringify(ready)))
    .mockResolvedValueOnce(new Response(JSON.stringify(conflict)));
  vi.stubGlobal("fetch", fetch);
  const client = createTestClient();
  render(
    <TooltipProvider>
      <RouteCard route={route} />
    </TooltipProvider>,
    renderWithClient(client),
  );
  expect(screen.getByText("Loading route status…")).toBeDefined();
  await waitFor(() => expect(screen.getAllByText("ready")).toHaveLength(4));
  await client.invalidateQueries({
    queryKey: applicationKeys.domain(route.id),
  });
  await waitFor(() =>
    expect(
      screen.getByRole("button", { name: "Adopt matching records" }),
    ).toBeDefined(),
  );
  expect(screen.getByText("DNS record conflict")).toBeDefined();
  expect(
    screen.getByRole("button", { name: "Replace conflicting records" }),
  ).toBeDefined();
  client.clear();
});

it("shows query errors, retries reads, and identifies stale status", async () => {
  const ready = contractFixtures("DomainState").find(
    (fixture) => fixture.name === "route-ready",
  )?.body;
  const fetch = vi
    .fn()
    .mockResolvedValueOnce(
      new Response('{"error":"Status unavailable"}', { status: 503 }),
    )
    .mockResolvedValueOnce(new Response(JSON.stringify(ready)))
    .mockResolvedValueOnce(new Response("unavailable", { status: 502 }));
  vi.stubGlobal("fetch", fetch);
  const client = createTestClient();
  render(
    <TooltipProvider>
      <RouteCard route={route} />
    </TooltipProvider>,
    renderWithClient(client),
  );
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Retry status" })).toBeDefined(),
  );
  expect(screen.queryByText("pending")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Retry status" }));
  await waitFor(() => expect(screen.getAllByText("ready")).toHaveLength(4));
  await client.invalidateQueries({
    queryKey: applicationKeys.domain(route.id),
  });
  await waitFor(() =>
    expect(screen.getByText("Showing the last known status.")).toBeDefined(),
  );
  expect(screen.getAllByText("ready")).toHaveLength(4);
  client.clear();
});
