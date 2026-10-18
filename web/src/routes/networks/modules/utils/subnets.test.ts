import { expect, it } from "vitest";
import type { components } from "@/lib/schema";
import { subnets } from "./subnets";
it("handles absent IPAM and returns only string subnets in order", () => {
  expect(subnets()).toEqual([]);
  const network: components["schemas"]["DockerNetwork"] = {
    Id: "net",
    Name: "net",
    Driver: "bridge",
    EnableIPv6: true,
    Labels: {},
    IPAM: {},
    Containers: {},
  };
  expect(subnets(network)).toEqual([]);
  expect(
    subnets({
      ...network,
      IPAM: {
        Config: [{ Subnet: "10.0.0.0/24" }, {}, { Subnet: "fd00::/64" }],
      },
    }),
  ).toEqual(["10.0.0.0/24", "fd00::/64"]);
});
