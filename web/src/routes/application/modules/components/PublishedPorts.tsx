import { Plus, Trash2 } from "lucide-react";

import type { DraftRow } from "@/lib/draft-rows";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { draftRow } from "@/lib/draft-rows";

import type { Port } from "../generics";

export function PublishedPorts({
  services,
  publicPorts,
  editPorts,
  busy,
  ports,
  save,
}: {
  services: { data?: { name: string }[] };
  publicPorts: Record<string, DraftRow<Port>[]>;
  editPorts: (next: Record<string, DraftRow<Port>[]>) => void;
  busy: boolean;
  ports: Record<string, DraftRow<Port>[]> | null;
  save: (published: boolean) => Promise<void>;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Published ports · administrator only</CardTitle>
        <p className="text-sm text-muted-foreground">
          Explicit host bindings are exceptions to domain-based ingress. They
          apply on the next deployment.
        </p>
      </CardHeader>
      <CardContent className="space-y-5">
        {services.data?.map((service) => (
          <section key={service.name} className="space-y-3">
            <h3 className="text-sm font-medium">{service.name}</h3>
            {(publicPorts[service.name] || []).map((port, index) => (
              <div
                className="grid gap-3 rounded-lg border p-3 sm:grid-cols-4"
                key={port.rowId}
              >
                {(["host", "published", "target"] as const).map((key) => (
                  <div className="space-y-1" key={key}>
                    <Label htmlFor={`port-${service.name}-${index}-${key}`}>
                      {key === "host"
                        ? "Host IP"
                        : key === "published"
                          ? "Host port"
                          : "Container port"}
                    </Label>
                    <Input
                      id={`port-${service.name}-${index}-${key}`}
                      type={key === "host" ? "text" : "number"}
                      value={port[key]}
                      onChange={(e) =>
                        editPorts({
                          ...publicPorts,
                          [service.name]: publicPorts[service.name].map(
                            (p, i) =>
                              i === index
                                ? {
                                    ...p,
                                    [key]:
                                      key === "host"
                                        ? e.target.value
                                        : Number(e.target.value),
                                  }
                                : p,
                          ),
                        })
                      }
                    />
                  </div>
                ))}
                <div className="flex items-end gap-1">
                  <Select
                    value={port.protocol}
                    onValueChange={(protocol) =>
                      editPorts({
                        ...publicPorts,
                        [service.name]: publicPorts[service.name].map((p, i) =>
                          i === index ? { ...p, protocol } : p,
                        ),
                      })
                    }
                  >
                    <SelectTrigger aria-label="Port protocol">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="tcp">TCP</SelectItem>
                      <SelectItem value="udp">UDP</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Remove published port"
                    onClick={() =>
                      editPorts({
                        ...publicPorts,
                        [service.name]: publicPorts[service.name].filter(
                          (_, i) => i !== index,
                        ),
                      })
                    }
                  >
                    <Trash2 />
                  </Button>
                </div>
              </div>
            ))}
            <Button
              variant="outline"
              onClick={() =>
                editPorts({
                  ...publicPorts,
                  [service.name]: [
                    ...(publicPorts[service.name] || []),
                    {
                      ...draftRow({
                        host: "0.0.0.0",
                        published: 8080,
                        target: 8080,
                        protocol: "tcp",
                      }),
                    },
                  ],
                })
              }
            >
              <Plus />
              Add port exception
            </Button>
          </section>
        ))}
        <Button disabled={busy || !ports} onClick={() => void save(true)}>
          Save published ports
        </Button>
      </CardContent>
    </Card>
  );
}
