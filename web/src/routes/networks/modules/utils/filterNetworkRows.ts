import type { Resource } from "@/lib/api/types";

import { text } from "@/lib/resource-fields";

import type { networkRows } from "./networkRows";

import { subnets } from "./subnets";

export type NetworkFilters = { search: string; type: string; status: string };

export function filterNetworkRows(
  inventory: ReturnType<typeof networkRows>,
  byId: Map<string, Resource>,
  filters: NetworkFilters,
  serverName = "",
) {
  const query = filters.search.trim().toLowerCase();
  function matches(values: string[], type: string, status: string) {
    return (
      (!query || values.join(" ").toLowerCase().includes(query)) &&
      (filters.type === "all" || filters.type === type) &&
      (filters.status === "all" || filters.status === status)
    );
  }
  return {
    rows: inventory.rows.filter(({ resource, docker }) => {
      let type = "external";
      if (resource.data.managed) type = "managed";
      if (resource.data.ingressApp) type = "ingress";
      return matches(
        [
          resource.name,
          resource.id,
          docker?.Name || "",
          docker?.Id || "",
          byId.get(text(resource.data, "serverId"))?.name || "",
          text(resource.data, "subnet"),
          text(resource.data, "ipv6Subnet"),
          ...subnets(docker),
        ],
        type,
        text(resource.data, "status") || "unknown",
      );
    }),
    unregistered: inventory.unregistered.filter((network) =>
      matches(
        [network.Name, network.Id, serverName, ...subnets(network)],
        ["bridge", "host", "none"].includes(network.Name)
          ? "builtin"
          : "unregistered",
        "available",
      ),
    ),
  };
}
