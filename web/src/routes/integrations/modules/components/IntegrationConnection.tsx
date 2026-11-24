import { Activity, Users } from "lucide-react";

import type { Resource } from "@/lib/api/types";

import { ProviderLogo } from "@/components/ProviderName";
import { Button } from "@/components/ui/button";
import { providerName } from "@/lib/providers";
import { text } from "@/lib/resource-fields";
import { useAdmin } from "@/lib/session";

import { isDeletableIntegration } from "../generics/isDeletableIntegration";
import { NotificationDelivery } from "./NotificationDelivery";
export type IntegrationConnectionProps = {
  resource: Resource;
  teamName?: string;
};
export function IntegrationConnection({
  resource,
  teamName,
}: IntegrationConnectionProps) {
  const admin = useAdmin();
  const sharedGit = resource.kind === "git" && !resource.teamId;
  return (
    <div className="flex flex-wrap items-center justify-between gap-4 border-t px-6 py-5">
      <div className="flex min-w-0 items-center gap-4">
        <div className="shrink-0 rounded-lg border bg-muted/50 p-2.5">
          {resource.kind === "git" || resource.kind === "dns" ? (
            <ProviderLogo
              provider={text(resource.data, "provider")}
              className="size-5"
            />
          ) : (
            <Activity className="size-4" />
          )}
        </div>
        <div className="min-w-0">
          <p className="break-words text-sm font-medium">{resource.name}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {text(resource.data, "provider")
              ? providerName(text(resource.data, "provider"))
              : text(
                  resource.data,
                  resource.kind === "registry" ? "hostname" : "url",
                )}
            {resource.kind === "git" && teamName && ` · ${teamName}`}
          </p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {admin && resource.kind === "webhook" && (
          <NotificationDelivery id={resource.id} />
        )}
        {(sharedGit || resource.kind === "registry") && (
          <Button
            disabled={!resource.canWrite}
            variant="outline"
            size="sm"
            data-action="grants"
            data-resource-id={resource.id}
          >
            <Users />
            Team access
          </Button>
        )}
        <Button
          disabled={!resource.canWrite}
          variant="outline"
          size="sm"
          data-action="configure"
          data-resource-id={resource.id}
        >
          Configure
        </Button>
        {isDeletableIntegration(resource) && (
          <Button
            disabled={!resource.canWrite}
            variant="outline"
            size="sm"
            data-action="delete"
            data-resource-id={resource.id}
          >
            Delete
          </Button>
        )}
      </div>
    </div>
  );
}
