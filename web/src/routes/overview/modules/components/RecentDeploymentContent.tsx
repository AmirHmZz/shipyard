import { GitBranch } from "lucide-react";

import type { Resource } from "@/lib/api/types";
import type { useDeployments } from "@/lib/hooks/useDeployments";

import { DeploymentTable } from "@/components/deployment-table";
import { ErrorState } from "@/components/Shared";
export type RecentDeploymentContentProps = {
  deployments: ReturnType<typeof useDeployments>;
  rows: Resource[];
};
export function RecentDeploymentContent({
  deployments,
  rows,
}: RecentDeploymentContentProps) {
  if (deployments.error) return <ErrorState error={deployments.error} />;
  const latest = deployments.data || [];
  if (latest.length)
    return (
      <DeploymentTable deployments={latest.slice(0, 7)} resources={rows} />
    );
  return (
    <div className="flex min-h-40 items-center justify-center gap-3 p-6 text-sm text-muted-foreground">
      <GitBranch className="size-5" />
      Your first deployment will appear here.
    </div>
  );
}
