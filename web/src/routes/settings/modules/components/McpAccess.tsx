import type { FormEvent, MouseEvent } from "react";

import { useState } from "react";
import { toast } from "sonner";
import * as z from "zod/mini";

import { Confirm, Empty, ErrorState, Loading } from "@/components/Shared";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { toastValidationError } from "@/lib/api/toaster";

import { mcpTokenInputSchema } from "../generics";
import { useIssueMcpToken } from "../hooks/useIssueMcpToken";
import { useMcpTokens } from "../hooks/useMcpTokens";
import { useRevokeMcpToken } from "../hooks/useRevokeMcpToken";
import { McpTokenForm } from "./McpTokenForm";

export function McpAccess() {
  const inventory = useMcpTokens();
  const issue = useIssueMcpToken();
  const revoke = useRevokeMcpToken();
  const [confirmId, setConfirmId] = useState("");

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const parsed = z.safeParse(mcpTokenInputSchema, {
      name: data.get("name"),
      projectIds: data.getAll("projectIds"),
      expiryDays: data.get("expiryDays"),
    });
    if (!parsed.success) {
      toastValidationError(parsed.error);
      return;
    }
    issue.mutate(parsed.data, {
      onSuccess: () => form.reset(),
    });
  }

  async function copy() {
    if (!issue.data) return;
    try {
      await navigator.clipboard.writeText(issue.data.secret);
      toast.success("Token copied");
    } catch {
      toast.error("Copy the token manually");
    }
  }

  function openRevoke(event: MouseEvent<HTMLButtonElement>) {
    setConfirmId(event.currentTarget.dataset.token || "");
  }

  function closeRevoke(open: boolean) {
    if (!open && !revoke.isPending) setConfirmId("");
  }

  function confirmRevoke() {
    revoke.mutate(confirmId, { onSuccess: () => setConfirmId("") });
  }

  if (inventory.isPending) return <Loading />;
  if (inventory.error) return <ErrorState error={inventory.error} />;
  const { endpoint, tokens, projects } = inventory.data;
  const names = new Map(
    projects.map((project) => [
      project.id,
      project.teamName + " / " + project.name,
    ]),
  );
  const confirmToken = tokens.find((token) => token.id === confirmId);
  return (
    <div className="flex flex-col gap-5">
      <Card>
        <CardHeader>
          <CardTitle>MCP access</CardTitle>
          <CardDescription>
            Agents can read deployment, job, and runtime logs in the selected
            projects.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div>
            <p className="mb-1 text-sm font-medium">HTTPS endpoint</p>
            {endpoint ? (
              <code className="text-sm break-all">{endpoint}</code>
            ) : (
              <p className="text-muted-foreground text-sm">
                Configure dashboard HTTPS to connect agents.
              </p>
            )}
          </div>
          {issue.data ? (
            <div className="flex max-w-xl flex-col gap-2 rounded-md border p-3">
              <label htmlFor="issued-mcp-token" className="text-sm font-medium">
                Copy this token now. It is displayed once.
              </label>
              <Input
                id="issued-mcp-token"
                readOnly
                autoComplete="off"
                value={issue.data.secret}
              />
              <div className="flex flex-wrap gap-2">
                <Button variant="secondary" onClick={copy}>
                  Copy token
                </Button>
                <Button variant="ghost" onClick={issue.reset}>
                  Done
                </Button>
              </div>
            </div>
          ) : null}
          {!issue.data && projects.length > 0 && (
            <McpTokenForm
              projects={projects}
              pending={issue.isPending}
              onSubmit={submit}
            />
          )}
          {!issue.data && projects.length === 0 && (
            <Empty
              title="No projects"
              description="Create a project before issuing a token."
            />
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Issued tokens</CardTitle>
        </CardHeader>
        <CardContent>
          {tokens.length === 0 ? (
            <Empty
              title="No MCP tokens"
              description="Create a token to connect an agent."
            />
          ) : (
            <ul className="divide-y">
              {tokens.map((token) => (
                <li
                  key={token.id}
                  className="flex flex-wrap items-center justify-between gap-3 py-3"
                >
                  <div className="min-w-0 space-y-1">
                    <p className="font-medium break-words">{token.name}</p>
                    <p className="text-muted-foreground text-sm break-words">
                      {token.projectIds
                        .map((id) => names.get(id) ?? id)
                        .join(", ") || "No projects"}
                    </p>
                    <p className="text-muted-foreground text-sm">
                      {token.revokedAt ? "Revoked" : "Expires"}{" "}
                      {new Date(
                        token.revokedAt ?? token.expiresAt,
                      ).toLocaleString()}
                    </p>
                  </div>
                  {!token.revokedAt && (
                    <Button
                      variant="outline"
                      data-token={token.id}
                      onClick={openRevoke}
                    >
                      Revoke
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
      {confirmToken && (
        <Confirm
          open
          onOpenChange={closeRevoke}
          title={`Revoke ${confirmToken.name}?`}
          description="Agents using this token will lose access immediately."
          onConfirm={confirmRevoke}
          pending={revoke.isPending}
          destructive
        />
      )}
    </div>
  );
}
