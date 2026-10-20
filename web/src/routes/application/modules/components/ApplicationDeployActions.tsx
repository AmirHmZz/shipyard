import {
  ChevronDown,
  Play,
  RotateCcw,
  RotateCw,
  Square,
  Trash2,
} from "lucide-react";
import { useState } from "react";

import type { Resource } from "@/lib/api";

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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";

export function ApplicationDeployActions({
  app,
  runtime,
  busy,
  deploy,
  deployError,
  resetDeploy,
  onAction,
  onDelete,
}: {
  app: Resource;
  runtime?: { releaseId?: string; status: string };
  busy: boolean;
  deploy: (
    fresh?: boolean,
    confirmName?: string,
    onSuccess?: () => void,
  ) => void;
  deployError: string;
  resetDeploy: () => void;
  onAction: (action: string) => void;
  onDelete: () => void;
}) {
  const [freshOpen, setFreshOpen] = useState(false);
  const [name, setName] = useState("");
  const canDeploy =
    app.canWrite &&
    !app.data.previewClosed &&
    (!app.data.previewOf || !!app.data.approvedSha);
  const canControl =
    app.canWrite && !!runtime?.releaseId && !app.data.previewClosed;
  const stopped = runtime?.status === "stopped";

  function freshDeploy() {
    deploy(true, name, () => setFreshOpen(false));
  }

  return (
    <>
      <ButtonGroup aria-label="Deployment actions">
        <Button disabled={busy || !canDeploy} onClick={() => void deploy()}>
          {busy ? <Spinner className="size-4" /> : <Play />}Deploy
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              size="icon"
              className="border-l border-primary-foreground/25"
              aria-label="Application actions"
              disabled={busy || !app.canWrite}
            >
              <ChevronDown />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-48">
            <DropdownMenuItem
              disabled={!canDeploy}
              onSelect={() => {
                setName("");
                resetDeploy();
                setFreshOpen(true);
              }}
            >
              <RotateCw />
              Fresh deploy
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={!canControl}
              onSelect={() => onAction("restart")}
            >
              <RotateCcw />
              Restart
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={!canControl}
              onSelect={() => onAction(stopped ? "start" : "stop")}
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
      <Dialog
        open={freshOpen}
        onOpenChange={(open) => {
          if (!busy) setFreshOpen(open);
        }}
      >
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
          <div className="space-y-2">
            <Label htmlFor="fresh-deploy-name">
              Type {app.name} to confirm
            </Label>
            <Input
              id="fresh-deploy-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              autoComplete="off"
              disabled={busy}
            />
          </div>
          {deployError && (
            <Alert variant="destructive">
              <AlertDescription>{deployError}</AlertDescription>
            </Alert>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => setFreshOpen(false)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={busy || !canDeploy || name !== app.name}
              onClick={() => void freshDeploy()}
            >
              {busy ? <Spinner className="size-4" /> : <RotateCw />}Fresh deploy
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
