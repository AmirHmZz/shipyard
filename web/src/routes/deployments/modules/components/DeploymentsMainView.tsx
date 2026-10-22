import { PageHeader } from "@/components/Shared";
import { useDeployments } from "@/lib/hooks/useDeployments";
import { useResources } from "@/lib/hooks/useResources";

import { DeploymentHistoryContent } from "./DeploymentHistoryContent";

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
      <DeploymentHistoryContent query={q} resources={resources.data || []} />
    </>
  );
}
