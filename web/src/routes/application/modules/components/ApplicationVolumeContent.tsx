import { Empty, ErrorState, Loading } from "@/components/Shared";
import { TableHeadings } from "@/components/TableHeadings";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import type { useApplicationVolumes } from "../hooks";
const volumeSizeFormatter = new Intl.NumberFormat(undefined, {
  maximumFractionDigits: 2,
});
function usedSpace(bytes: number | null) {
  if (bytes === null) return "Unavailable";
  if (bytes === 0) return "0 B";
  const unit = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), 5);
  return `${volumeSizeFormatter.format(bytes / 1024 ** unit)} ${["B", "KiB", "MiB", "GiB", "TiB", "PiB"][unit]}`;
}
export type ApplicationVolumeContentProps = {
  query: ReturnType<typeof useApplicationVolumes>;
};
export function ApplicationVolumeContent({
  query,
}: ApplicationVolumeContentProps) {
  if (query.isPending) return <Loading />;
  if (query.error) return <ErrorState error={query.error} />;
  return (
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
            <TableHeadings
              columns={[
                { id: "volume", label: <>Volume</> },
                { id: "server", label: <>Server</> },
                { id: "mounts", label: <>Mounts</> },
                { id: "status", label: <>Status</> },
                {
                  id: "data-used",
                  label: <>Data used</>,
                  className: "text-right",
                },
                { id: "created", label: <>Created</> },
              ]}
              rowProps={{}}
            />
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
                <TableCell>{volume.serverName || volume.serverId}</TableCell>
                <TableCell>
                  {volume.mounts.length ? (
                    volume.mounts.map((mount) => (
                      <div
                        key={`${mount.container}:${mount.path}`}
                        className="whitespace-nowrap text-xs"
                      >
                        <span className="font-medium">{mount.service}</span>:{" "}
                        <code>{mount.path}</code>
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
  );
}
