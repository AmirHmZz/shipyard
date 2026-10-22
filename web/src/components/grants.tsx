import type { Resource } from "@/lib/api/types";

import { ErrorState } from "@/components/Shared";
import { useResourceGrants } from "@/lib/hooks/useResourceGrants";

import { GrantToggle } from "./GrantToggle";
export type GrantsProps = { resource: Resource; resources: Resource[] };
export function Grants({ resource, resources }: GrantsProps) {
  const { derived, handlers } = useResourceGrants(resource, resources);
  const { q, teams } = derived;
  const { grantTeam } = handlers;
  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-muted-foreground">
        Grant this resource to a team before using it in an application.
      </p>
      {q.error ? (
        <ErrorState error={q.error} />
      ) : (
        teams.map(({ team, granted }) => (
          <GrantToggle
            key={team.id}
            team={team}
            granted={granted}
            grantTeam={grantTeam}
          />
        ))
      )}
    </div>
  );
}
