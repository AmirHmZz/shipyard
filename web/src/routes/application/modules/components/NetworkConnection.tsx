import { Trash2 } from "lucide-react";

import type { Resource } from "@/lib/api/types";

import { InputField } from "@/components/InputField";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import type { Service } from "../generics";

import { useNetworkConnection } from "../hooks";
export type NetworkConnectionProps = {
  app: Resource;
  service: { name: string; replicas: number };
  state: Service;
  connection: Service["connections"][number];
  index: number;
  update: (service: string, next: Partial<Service>) => void;
  networks: { data?: Resource[] };
};
export function NetworkConnection({
  app,
  service,
  state,
  connection,
  index,
  update,
  networks,
}: NetworkConnectionProps) {
  const { handlers } = useNetworkConnection(
    service.name,
    connection,
    state.connections,
    update,
  );
  const { changeNetwork, changeAddress, disconnect } = handlers;
  const availableNetworks = (networks.data || []).filter(
    (resource) =>
      resource.kind === "network" &&
      resource.data.serverId === app.data.serverId &&
      !resource.data.ingressApp &&
      resource.data.status === "ready",
  );
  return (
    <div className="flex flex-col gap-3 rounded-lg border p-4">
      <Label>Additional network</Label>
      <Select
        value={connection.networkId || undefined}
        disabled={!app.canWrite}
        onValueChange={changeNetwork}
      >
        <SelectTrigger aria-label={`Network for ${service.name}`}>
          <SelectValue placeholder="Select granted network" />
        </SelectTrigger>
        <SelectContent>
          {availableNetworks.map((r) => (
            <SelectItem key={r.id} value={r.id}>
              {r.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <div className="grid gap-3 sm:grid-cols-2">
        {(["ipv4", "ipv6"] as const).map((family) => (
          <InputField
            key={family}
            label={
              <>{family === "ipv4" ? "Fixed IPv4" : "Fixed IPv6"} (optional)</>
            }
            labelProps={{ htmlFor: `${service.name}-${index}-${family}` }}
            inputProps={{
              id: `${service.name}-${index}-${family}`,
              disabled:
                !app.canWrite ||
                service.replicas !== 1 ||
                app.data.workload === "job",
              value: connection[family] || "",
              onChange: changeAddress,
              "data-address-family": family,
            }}
          />
        ))}
      </div>
      <Button
        className="self-start"
        variant="ghost"
        disabled={!app.canWrite}
        onClick={disconnect}
      >
        <Trash2 />
        Disconnect on next deployment
      </Button>
    </div>
  );
}
