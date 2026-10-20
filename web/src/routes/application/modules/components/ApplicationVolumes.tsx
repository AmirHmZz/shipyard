import { RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";

import { useApplicationVolumes } from "../hooks";
import { ApplicationVolumeContent } from "./ApplicationVolumeContent";
export type ApplicationVolumesProps = {
  applicationId: string;
  enabled: boolean;
};
export function ApplicationVolumes({
  applicationId,
  enabled,
}: ApplicationVolumesProps) {
  const query = useApplicationVolumes(applicationId, enabled);
  function refresh() {
    void query.refetch();
  }
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-semibold">Application volumes</h2>
          <p className="text-sm text-muted-foreground">
            App-created storage, including retained unused volumes.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          disabled={query.isFetching}
          onClick={refresh}
        >
          <RefreshCw className="size-4" />
          Refresh
        </Button>
      </div>
      <ApplicationVolumeContent query={query} />
    </div>
  );
}
