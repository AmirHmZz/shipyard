import { lazy, Suspense, useEffect, useMemo } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router";
import { toast } from "sonner";

import type { Resource } from "@/lib/api/types";

import { ConfigurationGuard } from "@/components/configuration-surface";
import { DeleteResource, DeletionStatus } from "@/components/delete-resource";
import { Empty, ErrorState, Loading } from "@/components/shared";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { Variables } from "@/components/variables";
import { ApiException } from "@/lib/api/errors";
import { toastValidationError } from "@/lib/api/toaster";
import { describeError } from "@/lib/api/translate-error";
import { useDeployments } from "@/lib/hooks/useDeployments";
import { useResources } from "@/lib/hooks/useResources";
import { text } from "@/lib/resource-fields";
import { indexResources } from "@/lib/resource-index";

import { freshDeploySchema } from "../generics";
import {
  useApplicationRuntime,
  useApplicationMetrics,
  useApplicationReleases,
  useSelectedDeployment,
  useCreateDeployment,
  useApplicationDialogs,
} from "../hooks";
import { ApplicationActionConfirmation } from "./ApplicationActionConfirmation";
import { ApplicationDeployments } from "./ApplicationDeployments";
import { ApplicationDomains } from "./ApplicationDomains";
import { ApplicationHeader } from "./ApplicationHeader";
import { ApplicationNetworking } from "./ApplicationNetworking";
import { ApplicationOverview } from "./ApplicationOverview";
import { ApplicationPreviews } from "./ApplicationPreviews";
import { ApplicationStatus } from "./ApplicationStatus";
import { ApplicationTabList } from "./ApplicationTabList";
import { ApplicationVolumes } from "./ApplicationVolumes";
import { ComposeSource } from "./ComposeSource";
import { DeleteDeployment } from "./DeleteDeployment";
import { LogStream } from "./Streams";

const ContainerTerminal = lazy(() => import("./ContainerTerminal"));

export function ApplicationMainView() {
  const navigate = useNavigate();
  const { state, handlers } = useApplicationDialogs();
  const { deleting, confirmAction, deleteDeployment } = state;
  const { setDeleting, setConfirmAction, setDeleteDeployment } = handlers;
  const { id = "" } = useParams();
  const deployment = useCreateDeployment(id);
  const [params, setParams] = useSearchParams();
  const resources = useResources();
  const index = useMemo(
    () => indexResources(resources.data || []),
    [resources.data],
  );
  const tab =
    params.get("tab") ||
    (params.has("deployment") ? "deployments" : "overview");

  const deployments = useDeployments(id);
  const runtime = useApplicationRuntime(id);
  const metrics = useApplicationMetrics(id, tab === "overview");
  const releases = useApplicationReleases(id, tab === "deployments");
  const setTab = (value: string) =>
    setParams((previous) => {
      const next = new URLSearchParams(previous);
      next.set("tab", value);
      return next;
    });
  const openEditor = (resource: Resource | "new") =>
    navigate(
      `/configure/${resource === "new" ? "route/new?parent=" + id : resource.kind + "/" + resource.id + "?parent="}&return=${encodeURIComponent(location.pathname + location.search)}`,
    );
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
  if (resources.isPending) return <Loading />;
  if (resources.error) return <ErrorState error={resources.error} />;
  const rows = resources.data || [];
  const foundApp = index.byId.get(id);
  const app = foundApp && {
    ...foundApp,
    canWrite: foundApp.canWrite && !foundApp.data.deleting,
  };
  if (!app)
    return (
      <Empty
        title="Application not found"
        description="This application may not exist or you may not have access."
      />
    );
  const routes = rows.filter((r) => r.kind === "route" && r.parentId === id);
  const server = index.byId.get(text(app.data, "serverId"));
  const environment = index.byId.get(app.parentId || "");
  const project = index.byId.get(environment?.parentId || "");
  const containers = runtime.data?.containers || [];
  const latest = deployments.data?.[0];
  const directCompose = app.data.source === "compose";
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
  return (
    <>
      <ApplicationHeader
        app={app}
        provider={text(
          index.byId.get(text(app.data, "gitId"))?.data || {},
          "provider",
        )}
        project={project}
        environment={environment}
        runtime={runtime}
        busy={busy}
        deploy={deploy}
        deployError={deployment.error ? describeError(deployment.error) : ""}
        resetDeploy={deployment.reset}
        openEditor={openEditor}
        setConfirmAction={setConfirmAction}
        setDeleting={setDeleting}
      />
      {deleteDeployment && (
        <DeleteDeployment
          deployment={deleteDeployment}
          onClose={() => setDeleteDeployment(null)}
        />
      )}
      <ApplicationStatus app={app} runtime={runtime} server={server} />
      <DeletionStatus
        resource={foundApp ?? app}
        onRetry={() => setDeleting(true)}
      />
      <Tabs value={tab} onValueChange={setTab}>
        <ApplicationTabList app={app} directCompose={directCompose} />
        {directCompose && app.canWrite && (
          <TabsContent value="compose">
            <ConfigurationGuard className="max-w-none">
              <ComposeSource
                key={app.id}
                app={app}
                onDeploy={(deployment) => {
                  setParams({ deployment, tab: "deployments" });
                }}
              />
            </ConfigurationGuard>
          </TabsContent>
        )}
        <ApplicationOverview
          app={app}
          provider={text(
            index.byId.get(text(app.data, "gitId"))?.data || {},
            "provider",
          )}
          server={server}
          latest={latest}
          metrics={metrics}
          setParams={setParams}
        />
        <ApplicationDeployments
          app={app}
          rows={rows}
          deployments={deployments}
          releases={releases}
          runtime={runtime}
          params={params}
          setParams={setParams}
          setConfirmAction={setConfirmAction}
          onDeleteDeployment={(d) => {
            setDeleteDeployment(d);
          }}
        />
        <ApplicationDomains
          app={app}
          routes={routes}
          openEditor={openEditor}
          setConfirmAction={setConfirmAction}
        />
        <TabsContent value="variables">
          <ConfigurationGuard className="max-w-none">
            <Variables resource={app} />
          </ConfigurationGuard>
        </TabsContent>
        <TabsContent value="networking">
          <ConfigurationGuard className="max-w-none">
            <ApplicationNetworking key={app.id} app={app} />
          </ConfigurationGuard>
        </TabsContent>
        <TabsContent value="volumes">
          <ApplicationVolumes applicationId={id} enabled={tab === "volumes"} />
        </TabsContent>
        <TabsContent value="previews">
          <ConfigurationGuard>
            <ApplicationPreviews key={app.id} app={app} />
          </ConfigurationGuard>
        </TabsContent>
        <TabsContent value="logs">
          {containers.length ? (
            <LogStream applicationId={id} containers={containers} />
          ) : (
            <Empty
              title="No running containers"
              description="Deploy this application before opening its logs."
            />
          )}
        </TabsContent>
        <TabsContent value="terminal">
          {app.canWrite && containers.length ? (
            <Suspense fallback={<Loading />}>
              <ContainerTerminal applicationId={id} containers={containers} />
            </Suspense>
          ) : (
            <Empty
              title="No running containers"
              description="A container terminal is available after deployment."
            />
          )}
        </TabsContent>
      </Tabs>
      <ApplicationActionConfirmation
        confirmAction={confirmAction}
        setConfirmAction={setConfirmAction}
        id={id}
        setParams={setParams}
      />
      {deleting && (
        <DeleteResource
          resource={foundApp ?? app}
          onClose={() => setDeleting(false)}
          onDeleted={() =>
            navigate(project ? `/projects/${project.id}` : "/projects")
          }
        />
      )}
    </>
  );
}
