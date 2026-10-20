import { RefreshCw } from "lucide-react";

import { Empty, ErrorState, Loading } from "@/components/shared";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import { useApplicationVolumes } from "../hooks";

function usedSpace(bytes: number | null) {
  if (bytes === null) return "Unavailable";
  if (bytes === 0) return "0 B";
  const unit = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), 5);
  return `${new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(bytes / 1024 ** unit)} ${["B", "KiB", "MiB", "GiB", "TiB", "PiB"][unit]}`;
}

export function ApplicationVolumes({
  applicationId,
  enabled,
}: {
  applicationId: string;
  enabled: boolean;
}) {
  const query = useApplicationVolumes(applicationId, enabled);
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
          onClick={() => void query.refetch()}
        >
          <RefreshCw className="size-4" />
          Refresh
        </Button>
      </div>
      {query.isPending ? (
        <Loading />
      ) : query.error ? (
        <ErrorState error={query.error} />
      ) : (
        <>
          {query.data.errors.map((error) => (
            <Alert key={error.serverId}>
              <AlertDescription>
                {error.serverId}: {error.error}
              </AlertDescription>
            </Alert>
          ))}
          {query.data.volumes.length ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Volume</TableHead>
                  <TableHead>Server</TableHead>
                  <TableHead>Mounts</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Data used</TableHead>
                  <TableHead>Created</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {query.data.volumes.map((volume) => (
                  <TableRow key={`${volume.serverId}:${volume.name}`}>
                    <TableCell>
                      <div className="max-w-72 break-all font-mono text-xs">
                        {volume.name}
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        {volume.type} · {volume.driver}
                      </div>
                    </TableCell>
                    <TableCell>
                      {volume.serverName || volume.serverId}
                    </TableCell>
                    <TableCell>
                      {volume.mounts.length ? (
                        volume.mounts.map((mount) => (
                          <div
                            key={`${mount.container}:${mount.path}`}
                            className="whitespace-nowrap text-xs"
                          >
                            <span className="font-medium">{mount.service}</span>
                            : <code>{mount.path}</code>
                          </div>
                        ))
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {volume.inUse ? "In use" : "Unused"}
                      </Badge>
                    </TableCell>
                    <TableCell
                      className="whitespace-nowrap text-right tabular-nums"
                      title={
                        volume.measuredAt
                          ? `Measured ${new Date(volume.measuredAt).toLocaleString()}`
                          : "Docker usage measurement unavailable"
                      }
                    >
                      {usedSpace(volume.sizeBytes)}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-xs">
                      {volume.createdAt
                        ? new Date(volume.createdAt).toLocaleString()
                        : "Unavailable"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <Empty
              title="No application volumes"
              description="App-created named and anonymous volumes appear here after deployment. External/shared volumes and bind mounts are excluded."
            />
          )}
        </>
      )}
    </div>
  );
}
