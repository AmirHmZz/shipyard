import type * as React from "react";

import { useState } from "react";

import type { ApplicationDeployActionsOptions } from "../generics";
export function useApplicationDeployActions({
  app,
  runtime,
  busy,
  deploy,
  resetDeploy,
  onAction,
}: ApplicationDeployActionsOptions) {
  function handleButtonClick() {
    return void deploy();
  }
  function handleDropdownMenuItemSelect() {
    setName("");
    resetDeploy();
    setFreshOpen(true);
  }
  function handleDropdownMenuItemSelect2() {
    return onAction("restart");
  }
  function handleDropdownMenuItemSelect3() {
    return onAction(stopped ? "start" : "stop");
  }
  function handleDialogOpenChange(open: boolean) {
    if (!busy) setFreshOpen(open);
  }
  function handleInputChange(event: React.ChangeEvent<HTMLInputElement>) {
    return setName(event.target.value);
  }
  function handleButtonClick2() {
    return setFreshOpen(false);
  }
  function handleButtonClick3() {
    return void freshDeploy();
  }

  const [freshOpen, setFreshOpen] = useState(false);
  const [name, setName] = useState("");
  const canDeploy =
    app.canWrite &&
    !app.data.previewClosed &&
    (!app.data.previewOf || !!app.data.approvedSha) &&
    runtime?.status !== "stopping";
  const canControl =
    app.canWrite &&
    !!runtime?.releaseId &&
    !app.data.previewClosed &&
    runtime?.status !== "stopping";
  const stopped = runtime?.status === "stopped";
  const canStop =
    app.canWrite && !app.data.previewClosed && runtime?.status !== "stopping";

  function freshDeploy() {
    deploy(true, name, () => setFreshOpen(false));
  }

  return {
    state: { freshOpen, name },
    derived: { canDeploy, canControl, canStop, stopped },
    handlers: {
      handleButtonClick,
      handleDropdownMenuItemSelect,
      handleDropdownMenuItemSelect2,
      handleDropdownMenuItemSelect3,
      handleDialogOpenChange,
      handleInputChange,
      handleButtonClick2,
      handleButtonClick3,
    },
  };
}
