import { Grants } from "@/components/grants";
import { ResourceForm } from "@/components/resource-editor";
import { PageHeader } from "@/components/Shared";
import { Button } from "@/components/ui/button";
import { Variables } from "@/components/variables";

import type { useConfigurationPage } from "../hooks";

import { GitConnection } from "./GitConnection";
import { HAProxySettings } from "./HAProxySettings";

export type ConfigurationContentProps = {
  controller: ReturnType<typeof useConfigurationPage>;
};
export function ConfigurationContent({
  controller,
}: ConfigurationContentProps) {
  const { kind, resource, resources, location, parentId } = controller.derived;
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
  if (kind === "source-control")
    return (
      <GitConnection
        key={location.pathname}
        existing={resource}
        onClose={close}
        onManual={manualCredentials}
      />
    );
  if (kind === "variables" && resource)
    return (
      <>
        <PageHeader
          title={`${resource.name} variables`}
          description="Runtime variables and write-only secrets. Redeploy to apply changes."
        />
        <Variables key={resource.id} resource={resource} />
        <Button variant="outline" onClick={close}>
          Back
        </Button>
      </>
    );
  if (kind === "access" && resource)
    return (
      <>
        <PageHeader
          title={`${resource.name} access`}
          description="Manage the teams that can use this resource."
        />
        <Grants resource={resource} resources={resources} />
      </>
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
