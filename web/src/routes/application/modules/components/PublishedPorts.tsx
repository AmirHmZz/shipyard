import type { DraftRow } from "@/lib/draft-rows";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

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
    <Card>
      <CardHeader>
        <CardTitle>Published ports · administrator only</CardTitle>
        <p className="text-sm text-muted-foreground">
          Explicit host bindings are exceptions to domain-based ingress. They
          apply on the next deployment.
        </p>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        {services.data?.map((service) => (
          <PublishedPortService
            key={service.name}
            service={service.name}
            publicPorts={publicPorts}
            editPorts={editPorts}
          />
        ))}
        <Button
          className="self-start"
          disabled={busy || !ports}
          onClick={savePorts}
        >
          Save published ports
        </Button>
      </CardContent>
    </Card>
  );
}
