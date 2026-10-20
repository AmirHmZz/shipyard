import type { Resource } from "@/lib/api/types";

import { useConfigurationChanges } from "@/lib/configuration-state";

import { useGrants } from "./useGrants";
import { useSetGrant } from "./useSetGrant";

export function useResourceGrants(resource: Resource, resources: Resource[]) {
  const changes = useConfigurationChanges();
  const grant = useSetGrant(resource.id);
  const q = useGrants(resource);
  const granted = new Set(q.data);
  const teams = resources
    .filter((resource) => resource.kind === "team")
    .map((team) => ({ team, granted: granted.has(team.id) }));
  function grantTeam(teamId: string, granted: boolean) {
    grant.mutate({ teamId, granted }, { onSuccess: changes.saved });
  }
  return { state: {}, derived: { q, teams }, handlers: { grantTeam } };
}
