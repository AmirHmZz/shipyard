import { useHistory } from "../hooks";
import { ErrorState, Loading, StateBadge } from "@/components/shared";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export function History({ type }: { type: "audit" | "jobs" }) {
  const q = useHistory(type);
  if (q.isPending) return <Loading />;
  if (q.error) return <ErrorState error={q.error} />;
  return (
    <Card className="gap-0 overflow-hidden py-0 shadow-none">
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
    </Card>
  );
}
