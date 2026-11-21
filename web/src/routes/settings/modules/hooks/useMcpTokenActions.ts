import type { FormEvent, MouseEvent } from "react";

import { useRef, useState } from "react";
import * as z from "zod/mini";

import { toastValidationError } from "@/lib/api/toaster";

import type { McpTokenAction } from "../generics";

import {
  mcpTokenAccessSchema,
  mcpTokenActionSchema,
  mcpTokenInputSchema,
  mcpTokenRecreationSchema,
} from "../generics";
import { useDeleteMcpToken } from "./useDeleteMcpToken";
import { useEditMcpTokenAccess } from "./useEditMcpTokenAccess";
import { useIssueMcpToken } from "./useIssueMcpToken";
import { useRecreateMcpToken } from "./useRecreateMcpToken";
import { useRevokeMcpToken } from "./useRevokeMcpToken";

export function useMcpTokenActions() {
  const issue = useIssueMcpToken();
  const edit = useEditMcpTokenAccess();
  const recreate = useRecreateMcpToken();
  const revoke = useRevokeMcpToken();
  const remove = useDeleteMcpToken();
  const [action, setAction] = useState<McpTokenAction | { kind: "create" }>();
  const opener = useRef<HTMLElement | null>(null);

  const pending =
    issue.isPending ||
    edit.isPending ||
    recreate.isPending ||
    revoke.isPending ||
    remove.isPending;

  function openCreate(event: MouseEvent<HTMLButtonElement>) {
    opener.current = event.currentTarget;
    setAction({ kind: "create" });
  }

  function openTokenAction(event: MouseEvent<HTMLDivElement>) {
    const parsed = z.safeParse(mcpTokenActionSchema, {
      id: event.currentTarget.dataset.token,
      kind: event.currentTarget.dataset.action,
    });
    if (!parsed.success) return;
    opener.current = document.getElementById(
      `mcp-token-actions-${parsed.data.id}`,
    );
    setAction(parsed.data);
  }

  function close() {
    setAction(undefined);
    issue.reset();
    recreate.reset();
  }

  function closeDialog() {
    if (!pending) close();
  }

  function restoreFocus(event: Event) {
    event.preventDefault();
    if (opener.current?.isConnected) opener.current.focus();
    else document.getElementById("mcp-create-token")?.focus();
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || !action) return;
    const data = new FormData(event.currentTarget);
    const projectIds = data.getAll("projectIds");
    const expiryDays = data.get("expiryDays");

    switch (action.kind) {
      case "create": {
        const parsed = z.safeParse(mcpTokenInputSchema, {
          name: data.get("name"),
          projectIds,
          expiryDays,
        });
        if (parsed.success) issue.mutate(parsed.data);
        else toastValidationError(parsed.error);
        break;
      }
      case "edit": {
        const parsed = z.safeParse(mcpTokenAccessSchema, { projectIds });
        if (parsed.success)
          edit.mutate({ id: action.id, ...parsed.data }, { onSuccess: close });
        else toastValidationError(parsed.error);
        break;
      }
      case "recreate": {
        const parsed = z.safeParse(mcpTokenRecreationSchema, { expiryDays });
        if (parsed.success) recreate.mutate({ id: action.id, ...parsed.data });
        else toastValidationError(parsed.error);
        break;
      }
      case "revoke":
        revoke.mutate(action.id, { onSuccess: close });
        break;
      case "delete":
        remove.mutate(action.id, { onSuccess: close });
        break;
    }
  }

  return {
    action,
    pending,
    issued: issue.data ?? recreate.data,
    openCreate,
    openTokenAction,
    closeDialog,
    restoreFocus,
    submit,
  };
}
