import type { MouseEvent } from "react";

import type { Deployment } from "@/lib/api/types";

import type { ApplicationDeploymentsOptions } from "../generics";
export function useDeploymentHistory({
  app,
  runtime,
  deployments,
  params,
  setParams,
  setConfirmAction,
}: ApplicationDeploymentsOptions) {
  const directCompose = app.data.source === "compose";
  function canDelete(d: Deployment) {
    return (
      !!app.canWrite &&
      !!runtime.data &&
      ["healthy", "failed", "recovery_failed"].includes(d.state) &&
      runtime.data.releaseId !== (d.releaseId || d.id) &&
      !deployments.data?.some(
        (other) =>
          ["queued", "building", "deploying"].includes(other.state) &&
          other.rollbackId === (d.releaseId || d.id),
      )
    );
  }

  const selectedDeployment = params.get("deployment");
  function selectDeployment(deployment: string) {
    setParams({ deployment, tab: "deployments" });
  }
  function handleRollback(event: MouseEvent<HTMLDivElement>) {
    if (!(event.target instanceof Element)) return;
    const button = event.target.closest<HTMLButtonElement>(
      "button[data-release-id]",
    );
    if (!button || button.disabled || !event.currentTarget.contains(button))
      return;
    setConfirmAction("rollback:" + button.dataset.releaseId);
  }
  return {
    state: {},
    derived: { directCompose, selectedDeployment },
    handlers: { canDelete, selectDeployment, handleRollback },
  };
}
