import { ExternalLink } from "lucide-react";

import type { Resource } from "@/lib/api/types";

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { text } from "@/lib/resource-fields";

import type { InstanceDraft } from "../generics";

export type GitConnectionActionsProps = {
  onManual: () => void;
  onClose: () => void;
  existing?: Resource;
  provider: string;
  busy: boolean;
  name: string;
  instanceId: string;
  instanceForm: InstanceDraft | null;
  connect: () => void;
};
export function GitConnectionActions({
  onManual,
  onClose,
  existing,
  provider,
  busy,
  name,
  instanceId,
  instanceForm,
  connect,
}: GitConnectionActionsProps) {
  function handleButtonClick() {
    return void connect();
  }

  let connectionLabel =
    provider === "github" ? "Create GitHub App" : "Authorize Gitea";
  if (existing) connectionLabel = "Reconnect";
  return (
    <div className="flex flex-wrap justify-between gap-2 border-t pt-4">
      <Button variant="ghost" onClick={onManual}>
        Advanced: manual credentials
      </Button>
      <div className="flex gap-2">
        <Button variant="outline" onClick={onClose}>
          Close
        </Button>
        {(!existing ||
          (provider === "gitea" &&
            text(existing.data, "authMethod") === "oauth") ||
          (provider === "github" && !!text(existing.data, "appSlug"))) && (
          <Button
            disabled={
              busy ||
              (!existing &&
                (!name.trim() || (provider === "gitea" && !instanceId))) ||
              !!instanceForm
            }
            onClick={handleButtonClick}
          >
            {busy ? <Spinner className="size-4 " /> : <ExternalLink />}
            {connectionLabel}
          </Button>
        )}
      </div>
    </div>
  );
}
