import { Plus } from "lucide-react";

import type { DraftRow } from "@/lib/draft-rows";

import { SectionRow } from "@/components/SectionRow";
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
    <section className="flex flex-col gap-3 px-4 py-3">
      <SectionRow>
        <h3 className="min-w-0 text-sm font-semibold wrap-anywhere">
          {service}
        </h3>
        <Button size="sm" variant="outline" onClick={addPort}>
          <Plus />
          Add port exception
        </Button>
      </SectionRow>
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
    </section>
  );
}
