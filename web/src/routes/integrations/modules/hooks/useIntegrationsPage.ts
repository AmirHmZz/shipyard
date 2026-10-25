import type { MouseEvent } from "react";

import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router";

import { useResources } from "@/lib/hooks/useResources";
import { useAccount } from "@/lib/session";

import { useDeleteRegistry } from "./useDeleteRegistry";
export function useIntegrationsPage() {
  const navigate = useNavigate();
  const account = useAccount();
  const q = useResources();
  const deletion = useDeleteRegistry();
  const [deleting, setDeleting] = useState("");
  const [params] = useSearchParams();
  const resources = q.data || [];
  const deletingRegistry = resources.find(
    (resource) =>
      resource.id === deleting &&
      ["registry", "proxy", "webhook"].includes(resource.kind),
  );
  function closeDeletion(open: boolean) {
    if (!open && !deletion.isPending) setDeleting("");
  }
  function confirmDeletion() {
    if (deletingRegistry?.canWrite && !deletion.isPending)
      deletion.mutate(deletingRegistry.id, {
        onSuccess: () => setDeleting(""),
      });
  }
  const gitMessage =
    params.get("gitError") ||
    "Git connection authorized. Grant team access and, for Gitea, configure your repository webhook.";
  const showGitMessage = !!(
    params.get("gitError") || params.get("gitConnected")
  );
  const gitFailed = !!params.get("gitError");
  function handleIntegrationAction(event: MouseEvent<HTMLDivElement>) {
    if (!(event.target instanceof Element)) return;
    const button = event.target.closest<HTMLButtonElement>(
      "button[data-action]",
    );
    if (!button || button.disabled || !event.currentTarget.contains(button))
      return;
    const resource = resources.find(
      (resource) => resource.id === button.dataset.resourceId,
    );
    if (
      button.dataset.action === "delete" &&
      resource &&
      ["registry", "proxy", "webhook"].includes(resource.kind) &&
      resource.canWrite
    ) {
      setDeleting(resource.id);
      return;
    }
    if (button.dataset.action === "grants" && resource) {
      navigate("/configure/access/" + resource.id + "?return=/integrations");
      return;
    }
    const kind = resource?.kind || button.dataset.kind;
    if (!kind) return;
    const target = kind === "git" ? "source-control" : kind;
    navigate(
      "/configure/" +
        target +
        "/" +
        (resource?.id || "new") +
        "?return=/integrations",
    );
  }
  return {
    state: {},
    derived: {
      account,
      q,
      resources,
      gitMessage,
      showGitMessage,
      gitFailed,
      deletingRegistry,
      deletionPending: deletion.isPending,
    },
    handlers: { handleIntegrationAction, closeDeletion, confirmDeletion },
  };
}
