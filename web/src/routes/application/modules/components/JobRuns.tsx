import type { Resource } from "@/lib/api/types";

import { Empty, ErrorState, Loading, StateBadge } from "@/components/Shared";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import {
  Table,
  TableHeader,
  TableRow,
  TableHead,
  TableBody,
  TableCell,
} from "@/components/ui/table";

import { canDeleteJobRun } from "../generics/automation";
import { activeJobRun } from "../generics/jobs";
import { useJobRunsPage } from "../hooks/useJobRunsPage";
import { DeleteJobRuns } from "./DeleteJobRuns";
import { LogStream } from "./Streams";
export type JobRunsProps = { app: Resource; prepared: boolean };
export function JobRuns({ app, prepared }: JobRunsProps) {
  const page = useJobRunsPage(app.id);
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
  } = page;
  if (runs.isPending) return <Loading />;
  if (runs.error) return <ErrorState error={runs.error} />;
  return (
    <div className="flex flex-col gap-5">
      {deleting.length > 0 && (
        <DeleteJobRuns
          appId={app.id}
          ids={deleting}
          onClose={closeDelete}
          onDeleted={deleted}
        />
      )}
      <div className="flex flex-wrap items-center gap-3">
        <Button
          onClick={runNow}
          disabled={!app.canWrite || !prepared || !!active || start.isPending}
        >
          Run now
        </Button>
        <Button
          variant="outline"
          onClick={deleteSelected}
          disabled={!app.canWrite || !checkedVisible.length}
        >
          Delete selected ({checkedVisible.length})
        </Button>
        <span className="text-sm text-muted-foreground">
          Uses the latest deployed release. One active run at a time.
        </span>
      </div>
      {active && (
        <p role="status">
          Active run: {active.id} · {active.state}
          {active.retryAt && " · retry in " + retryIn + "s"}
        </p>
      )}
      {!runs.data?.items.length ? (
        <Empty
          title="No job runs"
          description="Deploy a release, then run it manually or enable its schedule."
        />
      ) : (
        <Card>
          <CardContent className="overflow-x-auto pt-5">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>
                    <input
                      type="checkbox"
                      aria-label="Select all finished runs on this page"
                      checked={
                        eligible.length > 0 &&
                        checkedVisible.length === eligible.length
                      }
                      onChange={toggleAll}
                      disabled={!app.canWrite || !eligible.length}
                    />
                  </TableHead>
                  <TableHead>Started</TableHead>
                  <TableHead>Trigger</TableHead>
                  <TableHead>Result</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {runs.data.items.map(function row(run) {
                  return (
                    <TableRow key={run.id} data-run={run.id}>
                      <TableCell>
                        <input
                          type="checkbox"
                          aria-label={`Select run ${run.id}`}
                          data-run={run.id}
                          checked={checkedVisible.includes(run.id)}
                          onChange={toggleRun}
                          disabled={!app.canWrite || !canDeleteJobRun(run)}
                        />
                      </TableCell>
                      <TableCell>
                        {new Date(run.createdAt).toLocaleString()}
                      </TableCell>
                      <TableCell>{run.trigger}</TableCell>
                      <TableCell>
                        <StateBadge state={run.state} />
                        {run.error && (
                          <p className="max-w-sm text-xs">{run.error}</p>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-2">
                          {canDeleteJobRun(run) && (
                            <Button
                              variant="outline"
                              size="sm"
                              data-run={run.id}
                              onClick={deleteRun}
                              disabled={!app.canWrite}
                            >
                              Delete run
                            </Button>
                          )}
                          <Button
                            variant="outline"
                            size="sm"
                            data-run={run.id}
                            onClick={selectRun}
                          >
                            Details
                          </Button>
                          {activeJobRun(run) ? (
                            <Button
                              variant="outline"
                              size="sm"
                              data-run={run.id}
                              onClick={cancelRun}
                              disabled={
                                !app.canWrite ||
                                cancel.isPending ||
                                run.state === "cancelling"
                              }
                            >
                              Cancel run
                            </Button>
                          ) : (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={runNow}
                              disabled={
                                !app.canWrite ||
                                !prepared ||
                                !!active ||
                                start.isPending
                              }
                            >
                              Run again
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
      <div className="flex gap-2">
        <Button variant="outline" onClick={firstPage} disabled={!cursor}>
          Newest
        </Button>
        <Button
          variant="outline"
          onClick={nextPage}
          disabled={!runs.data?.nextCursor}
        >
          Older runs
        </Button>
      </div>
      {detail.error && <ErrorState error={detail.error} />}
      {detail.data && (
        <Card>
          <CardHeader>
            <CardTitle>Run {detail.data.id}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 text-sm">
            <p>
              Release: <code>{detail.data.releaseId}</code> ·{" "}
              <StateBadge state={detail.data.state} />
            </p>
            {detail.data.attempts.map(function attempt(a) {
              return (
                <p key={a.number}>
                  Attempt {a.number}: {a.state} · exit {a.exitCode ?? "—"} ·{" "}
                  {a.startedAt
                    ? new Date(a.startedAt).toLocaleString()
                    : "Not started"}
                  {a.finishedAt &&
                    " → " + new Date(a.finishedAt).toLocaleString()}
                </p>
              );
            })}
            {detail.data.error && <p role="alert">{detail.data.error}</p>}
            {detail.data.cleanupPending && !activeJobRun(detail.data) && (
              <p>
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
