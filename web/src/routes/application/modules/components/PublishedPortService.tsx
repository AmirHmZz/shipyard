import { Plus } from "lucide-react";

import type { DraftRow } from "@/lib/draft-rows";

import { Button } from "@/components/ui/button";
import { draftRow } from "@/lib/draft-rows";

import type { Port } from "../generics";

import { PublishedPortRow } from "./PublishedPortRow";

export type PublishedPortServiceProps = {
  service: string;
  publicPorts: Record<string, DraftRow<Port>[]>;
  editPorts: (ports: Record<string, DraftRow<Port>[]>) => void;
};
export function PublishedPortService({
  service,
  publicPorts,
  editPorts,
}: PublishedPortServiceProps) {
  const ports = publicPorts[service] || [];
  function addPort() {
    editPorts({
      ...publicPorts,
      [service]: [
        ...ports,
        draftRow({
          host: "0.0.0.0",
          published: 8080,
          target: 8080,
          protocol: "tcp",
        }),
      ],
    });
  }
  return (
    <section className="space-y-3">
      <h3 className="text-sm font-medium">{service}</h3>
      {ports.map((port, index) => (
        <PublishedPortRow
          key={port.rowId}
          port={port}
          index={index}
          service={service}
          publicPorts={publicPorts}
          editPorts={editPorts}
        />
      ))}
      <Button variant="outline" onClick={addPort}>
        <Plus />
        Add port exception
      </Button>
    </section>
  );
}
