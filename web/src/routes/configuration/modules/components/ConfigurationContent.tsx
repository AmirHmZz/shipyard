import { Grants } from "@/components/grants";
import { ResourceForm } from "@/components/resource-editor";
import { PageHeader } from "@/components/Shared";
import { Button } from "@/components/ui/button";
import { Variables } from "@/components/variables";

import type { useConfigurationPage } from "../hooks";

import { GitConnection } from "./GitConnection";
import { HAProxySettings } from "./HAProxySettings";
import { ZoneGrants } from "./ZoneGrants";

export type ConfigurationContentProps = {
  controller: ReturnType<typeof useConfigurationPage>;
};
export function ConfigurationContent({
  controller,
}: ConfigurationContentProps) {
  const {
    kind,
    resource,
    resources,
    location,
    parentId,
    admin,
    writableTeams,
  } = controller.derived;
  const { close, saved, handleOpenChange, manualCredentials } =
    controller.handlers;
  if (kind === "haproxy" && resource)
    return (
      <HAProxySettings
        key={location.pathname}
        server={resource}
        onOpenChange={handleOpenChange}
      />
    );
  if (kind === "source-control") {
    if (
      resource
        ? resource.kind !== "git" || !resource.canWrite
        : !admin && !writableTeams.length
    )
      return (
        <p>Team owner access is required to configure this Git connection.</p>
      );
    return (
      <GitConnection
        key={location.pathname}
        existing={resource}
        admin={admin}
        teams={writableTeams}
        onClose={close}
        onManual={manualCredentials}
      />
    );
  }
  if (kind === "git" && (!admin || resource?.teamId))
    return (
      <p>
        Manual credentials are available for shared Git connections managed by a
        platform administrator.
      </p>
    );
  if (
    kind === "access" &&
    resource?.kind === "git" &&
    (!admin || resource.teamId)
  )
    return (
      <p>
        Team grants are available for shared Git connections managed by a
        platform administrator.
      </p>
    );
  if (kind === "variables" && resource)
    return (
      <div className="flex flex-col gap-7">
        <PageHeader
          className="mb-0"
          title={`${resource.name} variables`}
          description="Runtime variables and write-only secrets. Redeploy to apply changes."
        />
        <Variables key={resource.id} resource={resource} />
        <Button className="self-start" variant="outline" onClick={close}>
          Back
        </Button>
      </div>
    );
  if (kind === "access" && resource)
    return (
      <div className="flex flex-col gap-7">
        <PageHeader
          className="mb-0"
          title={`${resource.name} access`}
          description="Manage the teams that can use this resource."
        />
        {resource.kind === "zone" ? (
          <ZoneGrants key={resource.id} zone={resource} resources={resources} />
        ) : (
          <Grants resource={resource} resources={resources} />
        )}
      </div>
    );
  return (
    <ResourceForm
      key={location.pathname}
      open
      kind={kind || "application"}
      existing={resource}
      parentId={parentId}
      resources={resources}
      onOpenChange={handleOpenChange}
      onSaved={saved}
    />
  );
}
