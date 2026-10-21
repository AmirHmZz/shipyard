import type * as React from "react";

import { Plus } from "lucide-react";

import type { Resource } from "@/lib/api/types";

import { InputField } from "@/components/InputField";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { draftRow } from "@/lib/draft-rows";

import type { Service } from "../generics";

import { NetworkConnection } from "./NetworkConnection";

export type NetworkServiceCardProps = {
  app: Resource;
  service: { name: string; replicas: number };
  state: Service;
  update: (service: string, next: Partial<Service>) => void;
  networks: { data?: Resource[] };
};
export function NetworkServiceCard({
  app,
  service,
  state,
  update,
  networks,
}: NetworkServiceCardProps) {
  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    return update(service.name, { hostname: e.target.value });
  }
  function handleButtonClick() {
    return update(service.name, {
      connections: [...state.connections, draftRow({ networkId: "" })],
    });
  }

  return (
    <Card key={service.name}>
      <CardHeader>
        <CardTitle>{service.name}</CardTitle>
        <p className="text-xs text-muted-foreground">
          {service.replicas} container
          {service.replicas === 1 ? "" : "s"}
        </p>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <InputField
          label={<>Container hostname</>}
          labelProps={{ htmlFor: `hostname-${service.name}` }}
          inputProps={{
            id: `hostname-${service.name}`,
            value: state.hostname || "",
            disabled: !app.canWrite,
            onChange: handleInputChange,
          }}
        />
        {state.connections.map((connection, index) => (
          <NetworkConnection
            key={connection.rowId}
            connection={connection}
            index={index}
            app={app}
            service={service}
            state={state}
            update={update}
            networks={networks}
          />
        ))}
        <Button
          className="self-start"
          variant="outline"
          disabled={!app.canWrite}
          onClick={handleButtonClick}
        >
          <Plus />
          Connect network
        </Button>
      </CardContent>
    </Card>
  );
}
