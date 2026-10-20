import type { Resource } from "@/lib/api/types";
import type { useDeployments } from "@/lib/hooks/useDeployments";

import { DeploymentTable } from "@/components/deployment-table";
import { Empty, ErrorState, Loading } from "@/components/Shared";
import { Card } from "@/components/ui/card";

export type DeploymentHistoryContentProps = {
  query: ReturnType<typeof useDeployments>;
  resources: Resource[];
};
export function DeploymentHistoryContent({
  query,
  resources,
}: DeploymentHistoryContentProps) {
  if (query.error) return <ErrorState error={query.error} />;
  if (query.isPending) return <Loading />;
  if (!query.data?.length)
    return (
      <Empty
        title="Your release history starts here"
        description="Deploy an application to see its build progress, health checks, and rollback history."
      />
    );
  return (
    <Card className="gap-0 overflow-hidden py-0 shadow-none">
      <DeploymentTable deployments={query.data} resources={resources} />
    </Card>
  );
}
