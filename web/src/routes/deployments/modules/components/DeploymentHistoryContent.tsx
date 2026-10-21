import type { Resource } from "@/lib/api/types";
import type { useDeployments } from "@/lib/hooks/useDeployments";

import { DeploymentTable } from "@/components/deployment-table";
import { FlushCard } from "@/components/FlushCard";
import { Empty, ErrorState, Loading } from "@/components/Shared";

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
    <FlushCard>
      <DeploymentTable deployments={query.data} resources={resources} />
    </FlushCard>
  );
}
