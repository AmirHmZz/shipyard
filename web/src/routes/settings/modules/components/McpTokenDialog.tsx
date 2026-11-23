import type { FormEvent } from "react";

import { CopyButton } from "@/components/Shared";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";

import type {
  IssuedMcpToken,
  McpProject,
  McpToken,
  McpTokenAction,
} from "../generics";

import { McpTokenForm } from "./McpTokenForm";

export type McpTokenDialogProps = {
  mode: "create" | McpTokenAction["kind"];
  token?: McpToken;
  projects: McpProject[];
  issued?: IssuedMcpToken;
  pending: boolean;
  onClose: () => void;
  onCloseAutoFocus: (event: Event) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
};
export function McpTokenDialog({
  mode,
  token,
  projects,
  issued,
  pending,
  onClose,
  onCloseAutoFocus,
  onSubmit,
}: McpTokenDialogProps) {
  const name = token?.name ?? "this token";
  const copy = {
    create: {
      title: "Create MCP token",
      description:
        "Choose which projects an agent can read. You can also enable application actions for each project.",
    },
    edit: {
      title: "Edit project access",
      description: `Choose which projects ${name} can read. Changes take effect immediately.`,
    },
    recreate: {
      title: "Recreate token",
      description: `Issue a new secret for ${name} and start a fresh lifetime. Any previous secret stops working immediately.`,
    },
    revoke: {
      title: "Revoke token",
      description: `Agents using ${name} will lose access immediately. The owner can recreate the token from this record later.`,
    },
    delete: {
      title: "Delete token record",
      description: `Permanently remove ${name} and invalidate its secret. This action cannot be undone.`,
    },
  };
  const confirmation = mode === "revoke" || mode === "delete";

  function preventSecretDismiss(event: Event) {
    if (issued) event.preventDefault();
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent
        className="max-h-[calc(100dvh-2rem)] overflow-y-auto"
        showCloseButton={!pending && !issued}
        onCloseAutoFocus={onCloseAutoFocus}
        onPointerDownOutside={preventSecretDismiss}
      >
        <DialogHeader className="min-w-0 text-left">
          <DialogTitle>{issued ? "Token ready" : copy[mode].title}</DialogTitle>
          <DialogDescription className="wrap-break-word">
            {issued
              ? `Save this secret for ${issued.token.name} in your agent’s configuration.`
              : copy[mode].description}
          </DialogDescription>
        </DialogHeader>
        {issued && (
          <>
            <div className="flex min-w-0 flex-col gap-2 rounded-lg border bg-muted/30 p-4">
              <label htmlFor="issued-mcp-token" className="text-sm font-medium">
                Copy this token now. It is displayed once.
              </label>
              <Input
                id="issued-mcp-token"
                className="bg-background font-mono text-sm"
                readOnly
                autoComplete="off"
                spellCheck={false}
                value={issued.secret}
              />
              <CopyButton
                label="Copy token"
                value={issued.secret}
                className="self-start"
              />
            </div>
            <DialogFooter>
              <Button onClick={onClose}>Done</Button>
            </DialogFooter>
          </>
        )}
        {!issued && confirmation && (
          <form onSubmit={onSubmit}>
            <DialogFooter>
              <Button
                type="button"
                autoFocus
                variant="outline"
                onClick={onClose}
                disabled={pending}
              >
                Cancel
              </Button>
              <Button type="submit" variant="destructive" disabled={pending}>
                {pending && <Spinner />}
                {mode === "delete" ? "Delete record" : "Revoke token"}
              </Button>
            </DialogFooter>
          </form>
        )}
        {!issued && !confirmation && (
          <McpTokenForm
            mode={mode}
            projects={projects}
            projectIds={token?.projectIds ?? []}
            projectPermissions={token?.projectPermissions ?? {}}
            pending={pending}
            onSubmit={onSubmit}
            onCancel={onClose}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
