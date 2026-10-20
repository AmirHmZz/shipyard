import type { MouseEvent } from "react";

import type { Deployment, Resource } from "@/lib/api/types";

import { indexResources } from "@/lib/resource-index";

export type DeploymentTableOptions = {
  deployments: Deployment[] | undefined;
  resources: Resource[];
  onSelect?: (id: string) => void;
  onDelete?: (deployment: Deployment) => void;
  canDelete?: (deployment: Deployment) => boolean;
};
export function useDeploymentTable({
  deployments,
  resources,
  onSelect,
  onDelete,
  canDelete,
}: DeploymentTableOptions) {
  const { byId } = indexResources(resources);
  const rows = (deployments || []).map((deployment) => {
    let deletion: "hidden" | "disabled" | "enabled" = "hidden";
    if (onDelete)
      deletion =
        !canDelete?.(deployment) ||
        (!!deployment.deleting && !deployment.deletionError)
          ? "disabled"
          : "enabled";
    const selection: "button" | "link" = onSelect ? "button" : "link";
    return {
      deployment,
      applicationName:
        byId.get(deployment.applicationId)?.name ||
        deployment.applicationId.slice(0, 8),
      deletion,
      selection,
    };
  });
  function handleAction(event: MouseEvent<HTMLTableSectionElement>) {
    if (!(event.target instanceof Element)) return;
    const button = event.target.closest<HTMLButtonElement>(
      "button[data-deployment-id]",
    );
    if (!button || button.disabled || !event.currentTarget.contains(button))
      return;
    const deployment = deployments?.find(
      (deployment) => deployment.id === button.dataset.deploymentId,
    );
    if (!deployment) return;
    if (button.dataset.deploymentAction === "select") onSelect?.(deployment.id);
    if (button.dataset.deploymentAction === "delete") onDelete?.(deployment);
  }
  return { state: {}, derived: { rows }, handlers: { handleAction } };
}
