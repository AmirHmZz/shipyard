import type { MouseEventHandler } from "react";

import {
  CalendarClock,
  Eye,
  Hand,
  RotateCw,
  Square,
  Trash2,
} from "lucide-react";

import { IconButton } from "@/components/IconButton";
import { StateBadge } from "@/components/Shared";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { TableCell, TableRow } from "@/components/ui/table";

import type { JobRun } from "../generics/jobs";

import { canDeleteJobRun } from "../generics/automation";
import { activeJobRun } from "../generics/jobs";

export type JobRunRowProps = {
  run: JobRun;
  checked: boolean;
  selected: boolean;
  canWrite: boolean;
  canRun: boolean;
  cancelling: boolean;
  onCheck: MouseEventHandler<HTMLButtonElement>;
  onDelete: MouseEventHandler<HTMLButtonElement>;
  onSelect: MouseEventHandler<HTMLButtonElement>;
  onCancel: MouseEventHandler<HTMLButtonElement>;
  onRun: () => void;
};

export function JobRunRow({
  run,
  checked,
  selected,
  canWrite,
  canRun,
  cancelling,
  onCheck,
  onDelete,
  onSelect,
  onCancel,
  onRun,
}: JobRunRowProps) {
  const started = new Date(run.createdAt);
  return (
    <TableRow
      data-run={run.id}
      data-state={checked || selected ? "selected" : undefined}
      className="[&>td]:py-4"
    >
      <TableCell className="w-12 pl-5">
        <Checkbox
          aria-label={`Select run ${run.id}`}
          data-run={run.id}
          checked={checked}
          onClick={onCheck}
          disabled={!canWrite || !canDeleteJobRun(run)}
        />
      </TableCell>
      <TableCell>
        <div className="flex min-w-40 flex-col gap-1.5">
          <time dateTime={run.createdAt} className="text-sm font-medium">
            {started.toLocaleDateString()}
            <span className="ml-2 font-normal text-muted-foreground">
              {started.toLocaleTimeString()}
            </span>
          </time>
          <p
            className="max-w-64 truncate font-mono text-xs text-muted-foreground"
            title={run.id}
          >
            {run.id}
          </p>
          <p
            className="max-w-64 truncate text-xs text-muted-foreground"
            title={run.releaseId}
          >
            Release {run.releaseId}
          </p>
        </div>
      </TableCell>
      <TableCell>
        <Badge variant="outline" className="gap-1.5 font-normal capitalize">
          {run.trigger === "manual" ? (
            <Hand className="size-3" />
          ) : (
            <CalendarClock className="size-3" />
          )}
          {run.trigger}
        </Badge>
      </TableCell>
      <TableCell>
        <div className="flex flex-col items-start gap-1.5">
          <StateBadge state={run.state} />
          <p className="text-xs text-muted-foreground">
            {run.attempts.length}{" "}
            {run.attempts.length === 1 ? "attempt" : "attempts"}
          </p>
          {run.error && (
            <p className="max-w-64 whitespace-normal break-words text-xs text-destructive">
              {run.error}
            </p>
          )}
        </div>
      </TableCell>
      <TableCell className="pr-5">
        <div className="flex justify-end gap-1">
          <IconButton
            label="Details"
            data-run={run.id}
            onClick={onSelect}
            aria-pressed={selected}
          >
            <Eye />
          </IconButton>
          {activeJobRun(run) ? (
            <IconButton
              label="Cancel run"
              data-run={run.id}
              onClick={onCancel}
              disabled={!canWrite || cancelling || run.state === "cancelling"}
            >
              <Square />
            </IconButton>
          ) : (
            <IconButton label="Run again" onClick={onRun} disabled={!canRun}>
              <RotateCw />
            </IconButton>
          )}
          {canDeleteJobRun(run) && (
            <IconButton
              label="Delete run"
              className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
              data-run={run.id}
              onClick={onDelete}
              disabled={!canWrite}
            >
              <Trash2 />
            </IconButton>
          )}
        </div>
      </TableCell>
    </TableRow>
  );
}
