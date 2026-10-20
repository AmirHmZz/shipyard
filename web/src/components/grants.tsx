import { useMemo } from "react";

import type { Resource } from "@/lib/api/types";

import { ErrorState } from "@/components/shared";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useConfigurationChanges } from "@/lib/configuration-state";
import { useGrants, useSetGrant } from "@/lib/hooks";
export function Grants({
  resource,
  resources,
}: {
  resource: Resource;
  resources: Resource[];
}) {
  const changes = useConfigurationChanges();
  const grant = useSetGrant(resource.id);
  const q = useGrants(resource);
  const granted = useMemo(() => new Set(q.data), [q.data]);
  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        Grant this resource to a team before using it in an application.
      </p>
      {q.error ? (
        <ErrorState error={q.error} />
      ) : (
        resources
          .filter((r) => r.kind === "team")
          .map((team) => (
            <div
              key={team.id}
              className="flex items-center justify-between rounded-lg border p-3"
            >
              <Label>{team.name}</Label>
              <Switch
                checked={granted.has(team.id)}
                onCheckedChange={(granted) =>
                  grant.mutate(
                    { teamId: team.id, granted },
                    { onSuccess: changes.saved },
                  )
                }
              />
            </div>
          ))
      )}
    </div>
  );
}
