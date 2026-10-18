import { api } from "@/lib/api/client";
import { apiPath } from "@/lib/paths";

export function createNetwork(
  server: string,
  payload: {
    name: string;
    dockerId: string;
    subnet: string;
    dynamicRange: string;
    enableIPv6: boolean;
    ipv6Subnet: string;
  },
) {
  return api<unknown>(apiPath`/servers/${server}/networks`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}
