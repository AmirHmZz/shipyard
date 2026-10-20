import { Wrench } from "lucide-react";

import type { Resource } from "@/lib/api/types";

import { Button } from "@/components/ui/button";

import { ServerCard } from "./ServerCard";
export type ServerEntryProps = { server: Resource };
export function ServerEntry({ server }: ServerEntryProps) {
  const canProvision =
    server.data.connection !== "local" && !server.data.deleting;
  return (
    <div>
      <ServerCard server={server} />
      {canProvision && (
        <Button
          className="mt-2"
          disabled={!server.canWrite}
          variant="ghost"
          size="sm"
          data-server-id={server.id}
          data-action="provision"
        >
          <Wrench />
          Provision missing prerequisites
        </Button>
      )}
    </div>
  );
}
