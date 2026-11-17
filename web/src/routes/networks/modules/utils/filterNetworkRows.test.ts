import { expect, it } from "vitest";

import type { Resource } from "@/lib/api/types";

import type { DockerNetwork } from "../generics";

import { filterNetworkRows } from "./filterNetworkRows";
import { networkRows } from "./networkRows";

function resource(id: string, data: Resource["data"]): Resource {
  return {
    id,
    name: id,
    kind: "network",
    data,
    parentId: "",
    teamId: "",
    version: 1,
    canWrite: true,
    variables: {},
    secretKeys: [],
    createdAt: "2026-11-17",
    updatedAt: "2026-11-17",
  };
}
function docker(id: string, name: string, subnet: string): DockerNetwork {
  return {
    Id: id,
    Name: name,
    Driver: "bridge",
    EnableIPv6: false,
    Labels: {},
    Containers: {},
    IPAM: { Config: [{ Subnet: subnet }] },
  };
}
const resources = [
  resource("managed", {
    serverId: "server",
    managed: true,
    status: "ready",
    dockerId: "docker-managed",
  }),
  resource("ingress", {
    serverId: "server",
    managed: true,
    ingressApp: "app",
    status: "failed",
    subnet: "10.20.0.0/24",
  }),
  resource("external", {
    serverId: "server",
    managed: false,
    status: "ready",
    ipv6Subnet: "fd00::/64",
  }),
];
const inventory = networkRows(
  resources,
  [
    docker("docker-managed", "backend-bridge", "10.10.0.0/24"),
    docker("discovered", "outside", "172.16.0.0/24"),
    docker("builtin", "bridge", "172.17.0.0/16"),
  ],
  "",
);
const byId = new Map([
  ["server", { ...resource("server", {}), kind: "server", name: "Production" }],
]);
const all = { search: "", type: "all", status: "all" };

it("searches Docker names and addresses as well as registered metadata without inventory", function () {
  expect(
    filterNetworkRows(inventory, byId, {
      ...all,
      search: "  BACKEND  ",
    }).rows.map((row) => row.id),
  ).toEqual(["managed"]);
  expect(
    filterNetworkRows(inventory, byId, { ...all, search: "10.10.0" }).rows.map(
      (row) => row.id,
    ),
  ).toEqual(["managed"]);
  expect(
    filterNetworkRows(inventory, byId, { ...all, search: "fd00::" }).rows.map(
      (row) => row.id,
    ),
  ).toEqual(["external"]);
});

it("combines type and status and keeps application ingress distinct from shared managed networks", function () {
  expect(
    filterNetworkRows(inventory, byId, {
      ...all,
      type: "managed",
      status: "ready",
    }).rows.map((row) => row.id),
  ).toEqual(["managed"]);
  expect(
    filterNetworkRows(inventory, byId, {
      ...all,
      type: "ingress",
      status: "failed",
    }).rows.map((row) => row.id),
  ).toEqual(["ingress"]);
  expect(
    filterNetworkRows(inventory, byId, {
      ...all,
      type: "external",
      status: "failed",
    }).rows,
  ).toEqual([]);
});

it("separates unregistered and built-in networks and searches their selected server", function () {
  const result = filterNetworkRows(
    inventory,
    byId,
    { ...all, type: "unregistered", status: "available", search: "production" },
    "Production",
  );
  expect(result.rows).toEqual([]);
  expect(result.unregistered.map((network) => network.Id)).toEqual([
    "discovered",
  ]);
  expect(
    filterNetworkRows(inventory, byId, {
      ...all,
      type: "builtin",
    }).unregistered.map((network) => network.Id),
  ).toEqual(["builtin"]);
  expect(
    filterNetworkRows(inventory, byId, {
      ...all,
      search: "172.16",
    }).unregistered.map((network) => network.Id),
  ).toEqual(["discovered"]);
});

it("restores the entire inventory when filters are cleared without changing registration matching", function () {
  expect(
    filterNetworkRows(inventory, byId, { ...all, search: "missing" }),
  ).toEqual({ rows: [], unregistered: [] });
  expect(filterNetworkRows(inventory, byId, all)).toEqual(inventory);
  expect(inventory.rows[0].docker?.Id).toBe("docker-managed");
  expect(inventory.unregistered).toHaveLength(2);
});
