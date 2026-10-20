import type { Resource } from "@/lib/api/types";

import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

export type GrantToggleProps = {
  team: Resource;
  granted: boolean;
  grantTeam: (teamId: string, granted: boolean) => void;
};
export function GrantToggle({ team, granted, grantTeam }: GrantToggleProps) {
  function changeGrant(checked: boolean) {
    grantTeam(team.id, checked);
  }
  return (
    <div className="flex items-center justify-between rounded-lg border p-3">
      <Label>{team.name}</Label>
      <Switch checked={granted} onCheckedChange={changeGrant} />
    </div>
  );
}
