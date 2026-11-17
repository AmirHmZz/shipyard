import {
  Activity,
  ChevronLeft,
  ChevronRight,
  ListChecks,
  Play,
  Trash2,
} from "lucide-react";

import type { Resource } from "@/lib/api/types";

import { FlushCard } from "@/components/FlushCard";
import { SettingsHeading } from "@/components/SettingsHeading";
import { Empty, ErrorState, Loading, StateBadge } from "@/components/Shared";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Spinner } from "@/components/ui/spinner";
import {
  Table,
  TableHeader,
  TableRow,
  TableHead,
  TableBody,
} from "@/components/ui/table";

import { activeJobRun } from "../generics/jobs";
import { useJobRunsPage } from "../hooks/useJobRunsPage";
import { DeleteJobRuns } from "./DeleteJobRuns";
import { JobRunRow } from "./JobRunRow";
import { LogStream } from "./Streams";

export type JobRunsProps = { app: Resource; prepared: boolean };
export function JobRuns({ app, prepared }: JobRunsProps) {
  const {
    checkedVisible,
    eligible,
    toggleRun,
    toggleAll,
    deleteRun,
    deleteSelected,
    deleting,
    closeDelete,
    deleted,
    runs,
    detail,
    selected,
    active,
    retryIn,
    cursor,
    start,
    cancel,
    runNow,
    selectRun,
    cancelRun,
    nextPage,
    firstPage,
  } = useJobRunsPage(app.id);
  const canRun = app.canWrite && prepared && !active && !start.isPending;
  const allChecked =
    eligible.length > 0 && checkedVisible.length === eligible.length;
  let selection: boolean | "indeterminate" = false;
  if (allChecked) selection = true;
  else if (checkedVisible.length) selection = "indeterminate";
  if (runs.isPending) return <Loading />;
  if (runs.error) return <ErrorState error={runs.error} />;
  return (
    <div className="flex min-w-0 flex-col gap-5">
      {deleting.length > 0 && (
        <DeleteJobRuns
          appId={app.id}
          ids={deleting}
          onClose={closeDelete}
          onDeleted={deleted}
        />
      )}
      <SettingsHeading
        title="Run history"
        description="Track executions, inspect logs, and rerun the latest deployed release."
        action={
          <Button onClick={runNow} disabled={!canRun}>
            {start.isPending ? <Spinner /> : <Play />}Run now
          </Button>
        }
      />
      {active && (
        <div
          role="status"
          className="flex flex-wrap items-center gap-3 rounded-xl border border-primary/20 bg-primary/5 p-4"
        >
          <Activity className="size-4 shrink-0 text-primary" />
          <p className="min-w-0 flex-1 break-all text-sm">
            Active run: <span className="font-mono text-xs">{active.id}</span>
            {active.retryAt && " · retry in " + retryIn + "s"}
          </p>
          <StateBadge state={active.state} />
        </div>
      )}
      {!runs.data?.items.length ? (
        <Empty
          title="No job runs"
          description="Deploy a release, then run it manually or enable its schedule."
          icon={<ListChecks />}
        />
      ) : (
        <FlushCard>
          <div className="flex flex-wrap items-center justify-between gap-3 border-b bg-muted/20 px-5 py-3">
            <p className="text-xs text-muted-foreground">
              {checkedVisible.length
                ? `${checkedVisible.length} selected on this page`
                : "One active run at a time. All runs use their recorded execution policy."}
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={deleteSelected}
              disabled={!app.canWrite || !checkedVisible.length}
            >
              <Trash2 />
              Delete selected ({checkedVisible.length})
            </Button>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12 pl-5">
                  <Checkbox
                    aria-label="Select all finished runs on this page"
                    checked={selection}
                    onCheckedChange={toggleAll}
                    disabled={!app.canWrite || !eligible.length}
                  />
                </TableHead>
                <TableHead>Run / started</TableHead>
                <TableHead>Trigger</TableHead>
                <TableHead>Result</TableHead>
                <TableHead className="pr-5 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {runs.data.items.map((run) => (
                <JobRunRow
                  key={run.id}
                  run={run}
                  checked={checkedVisible.includes(run.id)}
                  selected={selected === run.id}
                  canWrite={app.canWrite}
                  canRun={canRun}
                  cancelling={cancel.isPending}
                  onCheck={toggleRun}
                  onDelete={deleteRun}
                  onSelect={selectRun}
                  onCancel={cancelRun}
                  onRun={runNow}
                />
              ))}
            </TableBody>
          </Table>
        </FlushCard>
      )}
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          {runs.data?.items.length || 0}{" "}
          {runs.data?.items.length === 1 ? "run" : "runs"} on this page
        </p>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={firstPage}
            disabled={!cursor}
          >
            <ChevronLeft />
            Newest
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={nextPage}
            disabled={!runs.data?.nextCursor}
          >
            Older runs
            <ChevronRight />
          </Button>
        </div>
      </div>
      {detail.isFetching && !detail.data && <Loading />}
      {detail.error && <ErrorState error={detail.error} />}
      {detail.data && (
        <Card className="min-w-0 shadow-none">
          <CardHeader className="flex flex-wrap items-center justify-between gap-3">
            <CardTitle className="min-w-0 break-all text-sm">
              Run {detail.data.id}
            </CardTitle>
            <StateBadge state={detail.data.state} />
          </CardHeader>
          <CardContent className="flex min-w-0 flex-col gap-4 text-sm">
            <p className="break-all text-xs text-muted-foreground">
              Release:{" "}
              <code className="text-foreground">{detail.data.releaseId}</code>
            </p>
            <div className="flex flex-col divide-y">
              {detail.data.attempts.map((a) => (
                <div
                  key={a.number}
                  className="flex flex-wrap items-center justify-between gap-3 py-3"
                >
                  <div className="flex items-center gap-2">
                    <span className="font-medium">Attempt {a.number}</span>
                    <StateBadge state={a.state} />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Exit {a.exitCode ?? "—"} ·{" "}
                    {a.startedAt
                      ? new Date(a.startedAt).toLocaleString()
                      : "Not started"}
                    {a.finishedAt &&
                      " → " + new Date(a.finishedAt).toLocaleString()}
                  </p>
                </div>
              ))}
            </div>
            {detail.data.error && (
              <p role="alert" className="break-words text-destructive">
                {detail.data.error}
              </p>
            )}
            {detail.data.cleanupPending && !activeJobRun(detail.data) && (
              <p className="rounded-lg border bg-muted/20 p-3 text-muted-foreground">
                Container cleanup is pending; the execution slot remains
                reserved.
              </p>
            )}
            <LogStream applicationId={app.id} runId={selected} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
