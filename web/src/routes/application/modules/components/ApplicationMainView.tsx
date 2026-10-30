import { lazy, Suspense } from "react";

import { ConfigurationGuard } from "@/components/ConfigurationSurface";
import { DeleteResource, DeletionStatus } from "@/components/DeleteResource";
import { Empty, ErrorState, Loading } from "@/components/Shared";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { Variables } from "@/components/variables";
import { describeError } from "@/lib/api/translate-error";
import { usesInlineCompose } from "@/lib/compose-source";
import { text } from "@/lib/resource-fields";

import { useApplicationPage } from "../hooks";
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
import { JobOverview } from "./JobOverview";
import { JobRuns } from "./JobRuns";
import { JobSchedule } from "./JobSchedule";
import { LogStream } from "./Streams";

const ContainerTerminal = lazy(() =>
  import("./ContainerTerminal").then((module) => ({
    default: module.ContainerTerminal,
  })),
);

export function ApplicationMainView() {
  const { state, derived, handlers } = useApplicationPage();
  const { deleting, confirmAction, deleteDeployment } = state;
  const {
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
  } = derived;
  const {
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
  } = handlers;
  if (resources.isPending) return <Loading />;
  if (resources.error) return <ErrorState error={resources.error} />;
  if (!app)
    return (
      <Empty
        title="Application not found"
        description="This application may not exist or you may not have access."
      />
    );
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
          onClose={closeDeleteDeployment}
        />
      )}
      <ApplicationStatus app={app} runtime={runtime} server={server} />
      <DeletionStatus resource={foundApp ?? app} onRetry={retryDeletion} />
      <Tabs value={tab} onValueChange={setTab}>
        <ApplicationTabList app={app} directCompose={directCompose} />
        {usesInlineCompose(app.data) && app.canWrite && (
          <TabsContent value="compose">
            <ConfigurationGuard className="max-w-none">
              <ComposeSource
                key={app.id}
                app={app}
                onDeploy={composeDeployed}
              />
            </ConfigurationGuard>
          </TabsContent>
        )}
        {app.data.workload === "job" ? (
          <TabsContent value="overview">
            <JobOverview app={app} releaseId={runtime.data?.releaseId} />
          </TabsContent>
        ) : (
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
        )}
        {app.data.workload === "job" && (
          <>
            <TabsContent value="runs">
              <JobRuns app={app} prepared={!!runtime.data?.releaseId} />
            </TabsContent>
            <TabsContent value="schedule">
              <JobSchedule key={app.id} app={app} />
            </TabsContent>
          </>
        )}
        <ApplicationDeployments
          app={app}
          rows={rows}
          deployments={deployments}
          releases={releases}
          runtime={runtime}
          params={params}
          setParams={setParams}
          setConfirmAction={setConfirmAction}
          onDeleteDeployment={setDeleteDeployment}
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
              <ContainerTerminal
                applicationId={id}
                containers={containers}
                containerDetails={runtime.data?.containerDetails}
              />
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
          onClose={closeDeletion}
          onDeleted={resourceDeleted}
        />
      )}
    </>
  );
}
