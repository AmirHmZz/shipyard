import type { Resource } from "@/lib/api/types";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { text } from "@/lib/resource-fields";

export type DeletionStatusProps = {
  resource: Resource;
  onRetry: () => void;
};

export function DeletionStatus({ resource, onRetry }: DeletionStatusProps) {
  if (!resource.data.deleting) return null;
  return (
    <Alert
      className="mb-5"
      variant={resource.data.deletionError ? "destructive" : "default"}
    >
      <AlertDescription className="gap-y-3">
        <p>
          {resource.data.deletionError
            ? `Cleanup needs attention: ${text(resource.data, "deletionError")}`
            : "Deletion in progress. Containers and routes are being cleaned up. Persistent volumes are preserved."}
        </p>
        {resource.canWrite && resource.data.deletionRoot === resource.id && (
          <Button variant="outline" size="sm" onClick={onRetry}>
            {resource.data.deletionError
              ? "Retry deletion"
              : "Deletion details"}
          </Button>
        )}
      </AlertDescription>
    </Alert>
  );
}
