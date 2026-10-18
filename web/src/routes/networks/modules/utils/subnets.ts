import type { components } from "@/lib/schema";

export function subnets(network?: components["schemas"]["DockerNetwork"]) {
  const config = network?.IPAM?.Config;
  return Array.isArray(config)
    ? config.flatMap((entry) =>
        typeof entry.Subnet === "string" ? [entry.Subnet] : [],
      )
    : [];
}
