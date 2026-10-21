import { FlushCard } from "@/components/FlushCard";
import { ErrorState, Loading, StateBadge } from "@/components/Shared";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import { useHistory } from "../hooks";

export type HistoryProps = { type: "audit" | "jobs" };
export function History({ type }: HistoryProps) {
  const q = useHistory(type);
  if (q.isPending) return <Loading />;
  if (q.error) return <ErrorState error={q.error} />;
  return (
    <FlushCard>
      <Table>
        <TableHeader>
          <TableRow>
            {(type === "jobs"
              ? ["Job", "Resource", "State", "Attempts", "Error"]
              : ["Action", "Resource", "User", "Time"]
            ).map((v) => (
              <TableHead key={v}>{v}</TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {q.data?.map((row) => (
            <TableRow key={row.id}>
              {(type === "jobs"
                ? ["kind", "resourceId", "state", "attempts", "error"]
                : ["action", "resourceId", "userId", "at"]
              ).map((key) => (
                <TableCell
                  key={key}
                  className="max-w-80 truncate font-mono text-xs"
                >
                  {key === "state" ? (
                    <StateBadge state={String(row[key])} />
                  ) : (
                    String(row[key] || "—")
                  )}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {!q.data?.length && (
        <p className="p-10 text-center text-sm text-muted-foreground">
          No entries yet.
        </p>
      )}
    </FlushCard>
  );
}
