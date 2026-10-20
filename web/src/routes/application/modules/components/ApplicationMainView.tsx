import { useQueryClient } from "@tanstack/react-query";
import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router";
import { toast } from "sonner";

import type { Deployment } from "@/lib/api";
import type { Resource } from "@/lib/api";

import { ConfigurationGuard } from "@/components/configuration-surface";
import { DeleteResource, DeletionStatus } from "@/components/delete-resource";
import { Empty, ErrorState, Loading } from "@/components/shared";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { Variables } from "@/components/variables";
import {
  APIError,
  errorMessage,
  text,
  useDeployments,
  useResources,
} from "@/lib/api";
import { deploymentKeys } from "@/lib/query-keys";
import { indexResources } from "@/lib/resource-index";

import { freshDeploySchema } from "../generics";
import {
  useApplicationRuntime,
  useApplicationMetrics,
  useApplicationReleases,
  useSelectedDeployment,
  useRunApplicationAction,
} from "../hooks";
import { createDeployment } from "../services";
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
  const [deleting, setDeleting] = useState(false);
  const { id = "" } = useParams();
  const actionMutation = useRunApplicationAction(id);
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
  const [confirmAction, setConfirmAction] = useState("");
  const [busy, setBusy] = useState(false);
  const client = useQueryClient();
  const [deleteDeployment, setDeleteDeployment] = useState<Deployment | null>(
    null,
  );
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
      selectedDeployment.error instanceof APIError &&
      selectedDeployment.error.status === 404
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
  async function deploy(fresh = false, confirmName = "") {
    setBusy(true);
    try {
      const d = await createDeployment(
        id,
        fresh
          ? freshDeploySchema(app!.name).parse({
              fresh,
              confirmName,
              version: app!.version,
            })
          : {},
      );
      setParams({ deployment: d.id, tab: "deployments" });
      await client.invalidateQueries({ queryKey: deploymentKeys.all });
      toast.success(fresh ? "Fresh deployment queued" : "Deployment queued");
    } catch (e) {
      if (fresh) throw e;
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  async function act(action: string) {
    await actionMutation.mutateAsync(action);
    toast.success(`Application ${action} requested`);
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
      <DeletionStatus resource={foundApp!} onRetry={() => setDeleting(true)} />
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
                  void client.invalidateQueries({
                    queryKey: deploymentKeys.all,
                  });
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
        client={client}
        act={act}
        setParams={setParams}
      />
      {deleting && (
        <DeleteResource
          resource={foundApp!}
          onClose={() => setDeleting(false)}
          onDeleted={() =>
            navigate(project ? `/projects/${project.id}` : "/projects")
          }
        />
      )}
    </>
  );
}
