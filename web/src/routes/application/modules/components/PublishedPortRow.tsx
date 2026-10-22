import { Trash2 } from "lucide-react";

import type { DraftRow } from "@/lib/draft-rows";

import { InputField } from "@/components/InputField";
import { SelectControl } from "@/components/SelectControl";
import { Button } from "@/components/ui/button";

import type { Port } from "../generics";

import { usePublishedPort } from "../hooks";

const fields: {
  key: "host" | "published" | "target";
  label: string;
  type: "text" | "number";
}[] = [
  { key: "host", label: "Host IP", type: "text" },
  { key: "published", label: "Host port", type: "number" },
  { key: "target", label: "Container port", type: "number" },
];
export type PublishedPortRowProps = {
  service: string;
  port: DraftRow<Port>;
  index: number;
  publicPorts: Record<string, DraftRow<Port>[]>;
  editPorts: (ports: Record<string, DraftRow<Port>[]>) => void;
};
export function PublishedPortRow({
  service,
  port,
  index,
  publicPorts,
  editPorts,
}: PublishedPortRowProps) {
  const { handlers } = usePublishedPort(service, port, publicPorts, editPorts);
  const { changeField, changeProtocol, removePort } = handlers;
  return (
    <div className="grid gap-3 rounded-lg border p-3 sm:grid-cols-4">
      {fields.map((field) => (
        <InputField
          key={field.key}
          className="flex flex-col gap-1"
          label={<>{field.label}</>}
          labelProps={{ htmlFor: `port-${service}-${index}-${field.key}` }}
          inputProps={{
            id: `port-${service}-${index}-${field.key}`,
            type: field.type,
            value: port[field.key],
            "data-port-field": field.key,
            onChange: changeField,
          }}
        />
      ))}
      <div className="flex items-end gap-1">
        <SelectControl
          value={port.protocol}
          onValueChange={changeProtocol}
          options={[
            { value: "tcp", label: "TCP" },
            { value: "udp", label: "UDP" },
          ]}
          triggerProps={{ "aria-label": "Port protocol" }}
        />
        <Button
          variant="ghost"
          size="icon"
          aria-label="Remove published port"
          onClick={removePort}
        >
          <Trash2 />
        </Button>
      </div>
    </div>
  );
}
