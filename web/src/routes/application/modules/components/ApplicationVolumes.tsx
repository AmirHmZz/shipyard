import { RefreshCw } from "lucide-react";

import { SectionRow } from "@/components/SectionRow";
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
    <div className="flex flex-col gap-4">
      <SectionRow>
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
          <RefreshCw />
          Refresh
        </Button>
      </SectionRow>
      <ApplicationVolumeContent query={query} />
    </div>
  );
}
