import { Plus, Trash2 } from "lucide-react";

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
import { type Resource } from "@/lib/api";
import { draftRow } from "@/lib/draft-rows";

import type { Service } from "../generics";

export function NetworkServiceCard({
  app,
  service,
  state,
  update,
  networks,
}: {
  app: Resource;
  service: { name: string; replicas: number };
  state: Service;
  update: (service: string, next: Partial<Service>) => void;
  networks: { data?: Resource[] };
}) {
  return (
    <Card key={service.name}>
      <CardHeader>
        <CardTitle>{service.name}</CardTitle>
        <p className="text-xs text-muted-foreground">
          {service.replicas} container
          {service.replicas === 1 ? "" : "s"}
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor={`hostname-${service.name}`}>Container hostname</Label>
          <Input
            id={`hostname-${service.name}`}
            value={state.hostname || ""}
            disabled={!app.canWrite}
            onChange={(e) => update(service.name, { hostname: e.target.value })}
          />
        </div>
        {state.connections.map((connection, index) => (
          <div
            className="space-y-3 rounded-lg border p-4"
            key={connection.rowId}
          >
            <Label>Additional network</Label>
            <Select
              value={connection.networkId || undefined}
              disabled={!app.canWrite}
              onValueChange={(id) =>
                update(service.name, {
                  connections: state.connections.map((c, i) =>
                    i === index ? { rowId: c.rowId, networkId: id } : c,
                  ),
                })
              }
            >
              <SelectTrigger aria-label={`Network for ${service.name}`}>
                <SelectValue placeholder="Select granted network" />
              </SelectTrigger>
              <SelectContent>
                {networks.data
                  ?.filter(
                    (r) =>
                      r.kind === "network" &&
                      r.data.serverId === app.data.serverId &&
                      !r.data.ingressApp &&
                      r.data.status === "ready",
                  )
                  .map((r) => (
                    <SelectItem key={r.id} value={r.id}>
                      {r.name}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
            <div className="grid gap-3 sm:grid-cols-2">
              {(["ipv4", "ipv6"] as const).map((family) => (
                <div className="space-y-2" key={family}>
                  <Label htmlFor={`${service.name}-${index}-${family}`}>
                    {family === "ipv4" ? "Fixed IPv4" : "Fixed IPv6"} (optional)
                  </Label>
                  <Input
                    id={`${service.name}-${index}-${family}`}
                    disabled={!app.canWrite || service.replicas !== 1}
                    value={connection[family] || ""}
                    onChange={(e) =>
                      update(service.name, {
                        connections: state.connections.map((c, i) =>
                          i === index ? { ...c, [family]: e.target.value } : c,
                        ),
                      })
                    }
                  />
                </div>
              ))}
            </div>
            <Button
              variant="ghost"
              disabled={!app.canWrite}
              onClick={() =>
                update(service.name, {
                  connections: state.connections.filter((_, i) => i !== index),
                })
              }
            >
              <Trash2 />
              Disconnect on next deployment
            </Button>
          </div>
        ))}
        <Button
          variant="outline"
          disabled={!app.canWrite}
          onClick={() =>
            update(service.name, {
              connections: [...state.connections, draftRow({ networkId: "" })],
            })
          }
        >
          <Plus />
          Connect network
        </Button>
      </CardContent>
    </Card>
  );
}
