import {
  ChevronDown,
  Play,
  RotateCcw,
  RotateCw,
  Square,
  Trash2,
} from "lucide-react";

import { InputField } from "@/components/InputField";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Spinner } from "@/components/ui/spinner";

import type { ApplicationDeployActionsOptions } from "../generics";

import { useApplicationDeployActions } from "../hooks";
export type ApplicationDeployActionsProps = ApplicationDeployActionsOptions;
export function ApplicationDeployActions(props: ApplicationDeployActionsProps) {
  const { app, busy, deployError, onDelete } = props;
  const { state, derived, handlers } = useApplicationDeployActions(props);
  const { freshOpen, name } = state;
  const { canDeploy, canControl, canStop, stopped } = derived;
  const {
    handleButtonClick,
    handleDropdownMenuItemSelect,
    handleDropdownMenuItemSelect2,
    handleDropdownMenuItemSelect3,
    handleDialogOpenChange,
    handleInputChange,
    handleButtonClick2,
    handleButtonClick3,
  } = handlers;
  return (
    <>
      <ButtonGroup aria-label="Deployment actions">
        <Button disabled={busy || !canDeploy} onClick={handleButtonClick}>
          {busy ? <Spinner className="size-4" /> : <Play />}Deploy
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              size="icon"
              className="border-l border-primary-foreground/25"
              aria-label="Application actions"
              disabled={!app.canWrite}
            >
              <ChevronDown />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-48">
            <DropdownMenuItem
              disabled={!canDeploy}
              onSelect={handleDropdownMenuItemSelect}
            >
              <RotateCw />
              Fresh deploy
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={!canControl || stopped}
              onSelect={handleDropdownMenuItemSelect2}
            >
              <RotateCcw />
              Restart
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={stopped ? !canControl : !canStop}
              onSelect={handleDropdownMenuItemSelect3}
            >
              {stopped ? <Play /> : <Square />}
              {stopped ? "Start" : "Stop"}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onSelect={onDelete}>
              <Trash2 />
              Delete application
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </ButtonGroup>
      <Dialog open={freshOpen} onOpenChange={handleDialogOpenChange}>
        <DialogContent showCloseButton={!busy}>
          <DialogHeader>
            <DialogTitle>Fresh deploy {app.name}?</DialogTitle>
            <DialogDescription>
              This stops the application and permanently erases its app-owned
              volume data before deploying again. External/shared volumes and
              host bind mounts are preserved. There will be downtime. If
              deployment fails after reset begins, the application stays
              stopped. Rolling back cannot restore erased data.
            </DialogDescription>
          </DialogHeader>
          <InputField
            label={<>Type {app.name} to confirm</>}
            labelProps={{ htmlFor: "fresh-deploy-name" }}
            inputProps={{
              id: "fresh-deploy-name",
              value: name,
              onChange: handleInputChange,
              autoComplete: "off",
              disabled: busy,
            }}
          />
          {deployError && (
            <Alert variant="destructive">
              <AlertDescription>{deployError}</AlertDescription>
            </Alert>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              disabled={busy}
              onClick={handleButtonClick2}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={busy || !canDeploy || name !== app.name}
              onClick={handleButtonClick3}
            >
              {busy ? <Spinner className="size-4" /> : <RotateCw />}Fresh deploy
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
