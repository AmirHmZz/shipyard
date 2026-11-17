import { Wrench } from "lucide-react";

import type { Resource } from "@/lib/api/types";

import { Button } from "@/components/ui/button";

import { ServerCard } from "./ServerCard";
export type ServerEntryProps = { server: Resource };
export function ServerEntry({ server }: ServerEntryProps) {
  const canProvision =
    server.data.connection !== "local" && !server.data.deleting;
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <ServerCard server={server} />
      {canProvision && (
        <Button
          className="self-start whitespace-normal text-left"
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
