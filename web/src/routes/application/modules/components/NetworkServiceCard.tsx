import type * as React from "react";

import { Plus } from "lucide-react";

import type { Resource } from "@/lib/api/types";

import { FlushCard } from "@/components/FlushCard";
import { InputField } from "@/components/InputField";
import { SectionRow } from "@/components/SectionRow";
import { Button } from "@/components/ui/button";
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
    <FlushCard>
      <SectionRow className="border-b px-4 py-3">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold wrap-anywhere">
            {service.name}
          </h3>
          <p className="text-xs text-muted-foreground">
            {service.replicas} container
            {service.replicas === 1 ? "" : "s"}
          </p>
        </div>
        <Button
          size="sm"
          variant="outline"
          disabled={!app.canWrite}
          onClick={handleButtonClick}
        >
          <Plus />
          Connect network
        </Button>
      </SectionRow>
      <div className="bg-muted/20 px-4 py-3">
        <InputField
          className="flex max-w-sm flex-col gap-2"
          label={<>Container hostname</>}
          labelProps={{ htmlFor: `hostname-${service.name}` }}
          inputProps={{
            id: `hostname-${service.name}`,
            value: state.hostname || "",
            disabled: !app.canWrite,
            onChange: handleInputChange,
          }}
        />
      </div>
      <div className="@container">
        {!state.connections.length && (
          <p className="border-t px-4 py-3 text-sm text-muted-foreground">
            No additional networks connected.
          </p>
        )}
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
      </div>
    </FlushCard>
  );
}
