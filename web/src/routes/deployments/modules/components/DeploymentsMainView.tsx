import { DeploymentTable } from "@/components/deployment-table";
import { Empty, ErrorState, Loading, PageHeader } from "@/components/shared";
import { Card } from "@/components/ui/card";
import { useDeployments, useResources } from "@/lib/api";

export function DeploymentsMainView() {
  const q = useDeployments();
  const resources = useResources();
  return (
    <>
      <PageHeader
        eyebrow="Workspace"
        title="Deployments"
        description="Every release, its source commit, and its outcome."
      />
      {q.error ? (
        <ErrorState error={q.error} />
      ) : q.isPending ? (
        <Loading />
      ) : q.data?.length ? (
        <Card className="gap-0 overflow-hidden py-0 shadow-none">
          <DeploymentTable
            deployments={q.data}
            resources={resources.data || []}
          />
        </Card>
      ) : (
        <Empty
          title="Your release history starts here"
          description="Deploy an application to see its build progress, health checks, and rollback history."
        />
      )}
    </>
  );
}
