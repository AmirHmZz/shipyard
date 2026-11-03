import { Trash2 } from "lucide-react";

import type { Resource } from "@/lib/api/types";

import { FormField } from "@/components/FormField";
import { InputField } from "@/components/InputField";
import { Button } from "@/components/ui/button";
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
  const networkFieldId = `${service.name}-${index}-network`;
  const availableNetworks = (networks.data || []).filter(
    (resource) =>
      resource.kind === "network" &&
      resource.data.serverId === app.data.serverId &&
      !resource.data.ingressApp &&
      resource.data.status === "ready",
  );
  return (
    <div className="grid items-end gap-3 border-t px-4 py-3 @min-[34rem]:grid-cols-[minmax(0,1.2fr)_minmax(0,2fr)_auto]">
      <FormField
        label="Additional network"
        labelProps={{ htmlFor: networkFieldId }}
      >
        <Select
          value={connection.networkId || undefined}
          disabled={!app.canWrite}
          onValueChange={changeNetwork}
        >
          <SelectTrigger
            id={networkFieldId}
            aria-label={`Network for ${service.name}`}
            className="w-full"
          >
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
      </FormField>
      <div className="grid gap-3 @min-[22rem]:grid-cols-2">
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
        className="justify-self-start"
        variant="ghost"
        size="icon"
        aria-label="Disconnect on next deployment"
        title="Disconnect on next deployment"
        disabled={!app.canWrite}
        onClick={disconnect}
      >
        <Trash2 />
      </Button>
    </div>
  );
}
