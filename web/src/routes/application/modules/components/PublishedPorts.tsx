import type { DraftRow } from "@/lib/draft-rows";

import { FlushCard } from "@/components/FlushCard";
import { SectionRow } from "@/components/SectionRow";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

import type { Port } from "../generics";

import { PublishedPortService } from "./PublishedPortService";
export type PublishedPortsProps = {
  services: { data?: { name: string }[] };
  publicPorts: Record<string, DraftRow<Port>[]>;
  editPorts: (next: Record<string, DraftRow<Port>[]>) => void;
  busy: boolean;
  ports: Record<string, DraftRow<Port>[]> | null;
  save: (published: boolean) => void;
};

export function PublishedPorts({
  services,
  publicPorts,
  editPorts,
  busy,
  ports,
  save,
}: PublishedPortsProps) {
  function savePorts() {
    save(true);
  }
  return (
    <section className="flex flex-col gap-3">
      <SectionRow>
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-semibold">Published ports</h2>
            <Badge variant="outline">Administrator only</Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            Host port exceptions apply on the next deployment.
          </p>
        </div>
        <Button size="sm" disabled={busy || !ports} onClick={savePorts}>
          Save published ports
        </Button>
      </SectionRow>
      {!!services.data?.length && (
        <FlushCard className="divide-y">
          {services.data?.map((service) => (
            <PublishedPortService
              key={service.name}
              service={service.name}
              publicPorts={publicPorts}
              editPorts={editPorts}
            />
          ))}
        </FlushCard>
      )}
    </section>
  );
}
