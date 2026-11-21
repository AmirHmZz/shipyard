import { Cable, KeyRound, Plus } from "lucide-react";
import { useEffect, useState } from "react";

import { CopyButton, ErrorState, Loading } from "@/components/Shared";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

import { useMcpTokenActions, useMcpTokens } from "../hooks";
import { McpTokenDialog } from "./McpTokenDialog";
import { McpTokenRow } from "./McpTokenRow";

export function McpAccess() {
  const inventory = useMcpTokens();
  const actions = useMcpTokenActions();
  const [now, setNow] = useState(Date.now);

  useEffect(() => {
    const clock = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(clock);
  }, []);

  if (inventory.isPending) return <Loading />;
  if (!inventory.data) return <ErrorState error={inventory.error} />;

  const { endpoint, tokens, projects } = inventory.data;
  const projectNames = new Map(
    projects.map((project) => [
      project.id,
      `${project.teamName} / ${project.name}`,
    ]),
  );
  const actionId =
    actions.action && "id" in actions.action ? actions.action.id : undefined;
  const selected = tokens.find((token) => token.id === actionId);

  return (
    <div className="flex min-w-0 flex-col gap-5">
      <Card className="gap-4 bg-linear-to-br from-primary/6 via-card to-card px-4 py-5 shadow-none sm:px-6">
        <div className="flex min-w-0 items-start gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-primary/20 bg-primary/10 text-primary">
            <Cable className="size-5" aria-hidden="true" />
          </div>
          <div className="flex min-w-0 flex-col gap-1">
            <h2 className="font-semibold">MCP connection</h2>
            <p className="text-sm text-muted-foreground">
              Connect an agent to read deployment, job, and runtime logs from
              its allowed projects.
            </p>
          </div>
        </div>
        <div className="flex flex-col gap-2 rounded-lg border bg-background/70 p-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 flex-col gap-1">
            <p className="text-xs font-medium text-muted-foreground">
              HTTPS endpoint
            </p>
            {endpoint ? (
              <code className="text-sm wrap-anywhere">{endpoint}</code>
            ) : (
              <p className="text-sm">
                Configure dashboard HTTPS to enable the MCP endpoint.
              </p>
            )}
          </div>
          {endpoint && (
            <CopyButton
              label="Copy endpoint"
              value={endpoint}
              className="self-start sm:self-center"
            />
          )}
        </div>
      </Card>

      <Card className="gap-0 py-0 shadow-none">
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-5 sm:px-6">
          <div>
            <h2 className="font-semibold">
              Access tokens{" "}
              <span className="ml-1 text-sm font-normal text-muted-foreground">
                ({tokens.length})
              </span>
            </h2>
            {tokens.length > 0 && projects.length === 0 && (
              <p className="mt-1 text-sm text-muted-foreground">
                Create a project before issuing a token.
              </p>
            )}
          </div>
          <Button
            id="mcp-create-token"
            onClick={actions.openCreate}
            disabled={projects.length === 0}
          >
            <Plus aria-hidden="true" /> Create token
          </Button>
        </div>
        {tokens.length === 0 ? (
          <div className="flex flex-col items-center gap-2 border-t px-4 py-10 text-center">
            <div className="mb-1 flex size-10 items-center justify-center rounded-xl border bg-muted/40 text-muted-foreground">
              <KeyRound className="size-5" aria-hidden="true" />
            </div>
            <h3 className="text-sm font-semibold">No MCP tokens</h3>
            <p className="text-sm text-muted-foreground">
              {projects.length === 0
                ? "Create a project before issuing a token."
                : "Create a token for the agent you want to connect."}
            </p>
          </div>
        ) : (
          <>
            <div
              aria-hidden="true"
              className="hidden grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_minmax(7rem,0.6fr)_2.25rem] gap-x-5 border-t bg-muted/35 px-6 py-2.5 text-xs font-medium text-muted-foreground lg:grid"
            >
              <span>Token name</span>
              <span>Allowed projects</span>
              <span>Status</span>
            </div>
            <ul aria-label="Access tokens" className="divide-y border-t">
              {tokens.map((token) => (
                <McpTokenRow
                  key={token.id}
                  token={token}
                  now={Math.max(now, inventory.dataUpdatedAt)}
                  projectNames={projectNames}
                  onAction={actions.openTokenAction}
                />
              ))}
            </ul>
          </>
        )}
      </Card>

      {actions.action && (
        <McpTokenDialog
          mode={actions.action.kind}
          token={selected}
          projects={projects}
          issued={actions.issued}
          pending={actions.pending}
          onClose={actions.closeDialog}
          onCloseAutoFocus={actions.restoreFocus}
          onSubmit={actions.submit}
        />
      )}
    </div>
  );
}
