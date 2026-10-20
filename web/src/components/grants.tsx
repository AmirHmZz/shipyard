import { useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import { toast } from "sonner";

import { ErrorState } from "@/components/shared";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { errorMessage, type Resource } from "@/lib/api";
import { useConfigurationChanges } from "@/lib/configuration-state";
import { useGrants } from "@/lib/hooks";
import { grantKeys } from "@/lib/query-keys";
import { setGrant } from "@/lib/services";
export function Grants({
  resource,
  resources,
}: {
  resource: Resource;
  resources: Resource[];
}) {
  const changes = useConfigurationChanges();
  const client = useQueryClient();
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
                onCheckedChange={async (granted) => {
                  try {
                    await setGrant(resource.id, team.id, granted);
                    await client.invalidateQueries({
                      queryKey: grantKeys.resource(resource.id),
                    });
                    changes.saved();
                  } catch (e) {
                    toast.error(errorMessage(e));
                  }
                }}
              />
            </div>
          ))
      )}
    </div>
  );
}
