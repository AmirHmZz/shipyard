import { useEffect } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router";
import { toast } from "sonner";

import type { Resource } from "@/lib/api/types";

import { ApiException } from "@/lib/api/errors";
import { toastValidationError } from "@/lib/api/toaster";
import { useDeployments } from "@/lib/hooks/useDeployments";
import { useResources } from "@/lib/hooks/useResources";
import { text } from "@/lib/resource-fields";
import { indexResources } from "@/lib/resource-index";

import { freshDeploySchema } from "../generics";
import { useApplicationDialogs } from "./useApplicationDialogs";
import { useApplicationMetrics } from "./useApplicationMetrics";
import { useApplicationReleases } from "./useApplicationReleases";
import { useApplicationRuntime } from "./useApplicationRuntime";
import { useCreateDeployment } from "./useCreateDeployment";
import { useSelectedDeployment } from "./useSelectedDeployment";
export function useApplicationPage() {
  const navigate = useNavigate();
  const { state, handlers } = useApplicationDialogs();
  const { deleting, confirmAction, deleteDeployment } = state;
  const { setDeleting, setConfirmAction, setDeleteDeployment } = handlers;
  const { id = "" } = useParams();
  const deployment = useCreateDeployment(id);
  const [params, setParams] = useSearchParams();
  const resources = useResources();
  const index = indexResources(resources.data || []);
  const tab =
    params.get("tab") ||
    (params.has("deployment") ? "deployments" : "overview");

  const deployments = useDeployments(id);
  const runtime = useApplicationRuntime(id);
  const metrics = useApplicationMetrics(id, tab === "overview");
  const releases = useApplicationReleases(id, tab === "deployments");
  function setTab(value: string) {
    return setParams((previous) => {
      const next = new URLSearchParams(previous);
      next.set("tab", value);
      return next;
    });
  }
  function openEditor(resource: Resource | "new") {
    return navigate(
      `/configure/${resource === "new" ? "route/new?parent=" + id : resource.kind + "/" + resource.id + "?parent="}&return=${encodeURIComponent(location.pathname + location.search)}`,
    );
  }
  const busy = deployment.isPending;
  const selected = params.get("deployment");
  const selectedDeployment = useSelectedDeployment(
    selected,
    !!selected &&
      !!deployments.data &&
      !deployments.data.some((d) => d.id === selected),
  );
  useEffect(() => {
    if (
      selected &&
      selectedDeployment.error instanceof ApiException &&
      selectedDeployment.error.error.kind === "http" &&
      selectedDeployment.error.error.status === 404
    ) {
      setParams(
        (previous) => {
          const next = new URLSearchParams(previous);
          next.delete("deployment");
          return next;
        },
        { replace: true },
      );
    }
  }, [selected, selectedDeployment.error, setParams]);

  const rows = resources.data || [];
  const foundApp = index.byId.get(id);
  const app = foundApp && {
    ...foundApp,
    canWrite: foundApp.canWrite && !foundApp.data.deleting,
  };

  const routes = rows.filter((r) => r.kind === "route" && r.parentId === id);
  const server = index.byId.get(text(app?.data || {}, "serverId"));
  const environment = index.byId.get(app?.parentId || "");
  const project = index.byId.get(environment?.parentId || "");
  const containers = runtime.data?.containers || [];
  const latest = deployments.data?.[0];
  const directCompose = app?.data.source === "compose";
  function deploy(fresh = false, confirmName = "", onSuccess?: () => void) {
    if (busy || !app) return;
    if (fresh) {
      const parsed = freshDeploySchema(app.name).safeParse({
        fresh,
        confirmName,
        version: app.version,
      });
      if (!parsed.success) {
        toastValidationError(parsed.error);
        return;
      }
      deployment.mutate(parsed.data, { onSuccess: completeDeployment });
    } else deployment.mutate({}, { onSuccess: completeDeployment });
    function completeDeployment(result: { id: string }) {
      setParams({ deployment: result.id, tab: "deployments" });
      toast.success(fresh ? "Fresh deployment queued" : "Deployment queued");
      onSuccess?.();
    }
  }

  function closeDeleteDeployment() {
    setDeleteDeployment(null);
  }
  function retryDeletion() {
    setDeleting(true);
  }
  function closeDeletion() {
    setDeleting(false);
  }
  function composeDeployed(deployment: string) {
    setParams({ deployment, tab: "deployments" });
  }
  function resourceDeleted() {
    navigate(project ? "/projects/" + project.id : "/projects");
  }
  return {
    state: { deleting, confirmAction, deleteDeployment },
    derived: {
      id,
      tab,
      params,
      resources,
      index,
      rows,
      foundApp,
      app,
      routes,
      server,
      environment,
      project,
      containers,
      latest,
      directCompose,
      busy,
      deployment,
      runtime,
      metrics,
      releases,
      deployments,
    },
    handlers: {
      setTab,
      setParams,
      openEditor,
      deploy,
      setDeleting,
      setConfirmAction,
      setDeleteDeployment,
      closeDeleteDeployment,
      retryDeletion,
      closeDeletion,
      composeDeployed,
      resourceDeleted,
    },
  };
}
