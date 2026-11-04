import { useState } from "react";

import type { Resource } from "@/lib/api/types";

import { FormField } from "@/components/FormField";
import { SelectControl } from "@/components/SelectControl";
import { ErrorState, Loading } from "@/components/Shared";

import { useZoneGrants } from "../hooks/useZoneGrants";
import { ZoneGrantForm } from "./ZoneGrantForm";

export type ZoneGrantsProps = { zone: Resource; resources: Resource[] };
export function ZoneGrants({ zone, resources }: ZoneGrantsProps) {
  const [teamId, setTeamId] = useState("");
  const query = useZoneGrants(zone.id);
  if (query.error) return <ErrorState error={query.error} />;
  if (query.isPending) return <Loading />;
  const grants = new Map(query.data.map((grant) => [grant.teamId, grant]));
  const grant = grants.get(teamId);
  const teams = resources
    .filter((resource) => resource.kind === "team")
    .map((team) => {
      const access = grants.get(team.id);
      let description = "No access";
      if (access?.mode === "whole") description = "Whole zone";
      if (access?.mode === "scoped") description = "Specific hostnames";
      return { value: team.id, label: `${team.name} · ${description}` };
    });
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">
        Choose the hostnames a team can use for application routes and PR
        previews.
      </p>
      <FormField label="Team" labelProps={{ htmlFor: "zone-access-team" }}>
        <SelectControl
          value={teamId || undefined}
          options={teams}
          placeholder="Select team"
          onValueChange={setTeamId}
          triggerProps={{ id: "zone-access-team" }}
        />
      </FormField>
      {teamId && (
        <ZoneGrantForm
          key={JSON.stringify([teamId, grant])}
          zoneId={zone.id}
          teamId={teamId}
          grant={grant}
        />
      )}
    </div>
  );
}
