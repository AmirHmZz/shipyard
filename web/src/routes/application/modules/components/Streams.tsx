import { ArrowDown, Copy, Eraser } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import type { LogLine } from "@/lib/log-buffer";

import { FlushCard } from "@/components/FlushCard";
import { StateBadge } from "@/components/Shared";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { LogBuffer } from "@/lib/log-buffer";
import { logText } from "@/lib/log-text";
import { inputNumberSchema } from "@/lib/schemas/coercion";

import { logMessageSchema, logStatusSchema } from "../generics";
import { useLogScroll } from "../hooks/useLogScroll";
export type LogStreamProps = {
  runId?: string;
  deploymentId?: string;
  applicationId?: string;
  containers?: string[];
};
export function LogStream({
  runId,
  deploymentId,
  applicationId,
  containers = [],
}: LogStreamProps) {
  function handleButtonClick() {
    return buffer.current?.clear();
  }
  async function handleButtonClick2() {
    try {
      await navigator.clipboard.writeText(
        (buffer.current?.snapshot() ?? lines)
          .map((line) => line.text)
          .join("\n"),
      );
      toast.success("Logs copied");
    } catch {
      toast.error("Clipboard is unavailable");
    }
  }

  const [selected, setSelected] = useState("");
  const buffer = useRef<LogBuffer | null>(null);
  const effectiveContainer = containers.includes(selected)
    ? selected
    : containers[0] || "";
  const endpoint = runId
    ? `/applications/${applicationId}/runs/${runId}/events`
    : deploymentId
      ? `/deployments/${deploymentId}/events`
      : `/applications/${applicationId}/logs?container=${encodeURIComponent(effectiveContainer)}`;
  const [output, setOutput] = useState({
    endpoint,
    lines: new Array<LogLine>(),
    state: "connecting",
    error: "",
  });
  const { lines, state, error } =
    output.endpoint === endpoint
      ? output
      : { lines: [], state: "connecting", error: "" };
  useEffect(() => {
    function updateOutput(values: Partial<typeof output>) {
      setOutput((previous) => ({
        ...(previous.endpoint === endpoint
          ? previous
          : { endpoint, lines: [], state: "connecting", error: "" }),
        ...values,
      }));
    }
    const current = new LogBuffer((lines) => updateOutput({ lines }));
    buffer.current = current;
    const source = new EventSource("/api/v1" + endpoint);
    let lastEventID = 0;
    source.addEventListener("log", (event) => {
      if (!(event instanceof MessageEvent)) return;
      if (deploymentId || runId) {
        const id = inputNumberSchema.safeParse(event.lastEventId);
        if (id.success && id.data > 0) {
          if (id.data <= lastEventID) return;
          lastEventID = id.data;
        }
      }

      const data = logMessageSchema.safeParse(event.data);
      if (!data.success) return;
      current.push(logText(data.data.message));
      updateOutput({ state: "connected" });
    });
    source.addEventListener("status", (event) => {
      if (!(event instanceof MessageEvent)) return;
      const result = logStatusSchema.safeParse(event.data);
      if (!result.success) return;
      const d = result.data;
      updateOutput({ state: d.state, error: d.error || "" });
      if (
        [
          "healthy",
          "failed",
          "recovery_failed",
          "cancelled",
          "succeeded",
          "timed_out",
          "skipped",
        ].includes(d.state) &&
        !d.cleanupPending
      )
        source.close();
    });
    source.onerror = () => {
      if (source.readyState === EventSource.CLOSED)
        updateOutput({ state: "ended" });
      else updateOutput({ state: "reconnecting" });
    };
    return () => {
      source.close();
      current.dispose();
      if (buffer.current === current) buffer.current = null;
    };
  }, [endpoint, deploymentId, runId]);
  const { scroll, paused, handleScroll, jumpToLatest } = useLogScroll(
    lines,
    endpoint,
  );
  return (
    <FlushCard>
      <CardHeader className="flex min-h-14 flex-wrap items-center justify-between border-b px-4 py-2.5 [.border-b]:pb-2.5">
        <CardTitle className="text-sm leading-6">
          {deploymentId ? (
            <>
              Deployment{" "}
              <span className="font-mono font-medium text-muted-foreground">
                {deploymentId.slice(0, 8)}
              </span>
            </>
          ) : (
            "Runtime logs"
          )}
        </CardTitle>
        <div className="flex items-center gap-2">
          {!deploymentId && containers.length > 1 && (
            <Select value={effectiveContainer} onValueChange={setSelected}>
              <SelectTrigger className="h-8 w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {containers.map((id) => (
                  <SelectItem key={id} value={id}>
                    {id.slice(0, 12)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <StateBadge state={state} />
          {paused && (
            <Button size="sm" variant="outline" onClick={jumpToLatest}>
              <ArrowDown className="size-3.5" />
              Jump to latest
            </Button>
          )}
          {!deploymentId && (
            <Button
              size="icon"
              className="size-8"
              variant="ghost"
              aria-label="Clear logs"
              onClick={handleButtonClick}
            >
              <Eraser className="size-3.5" />
            </Button>
          )}
          <Button
            size="icon"
            className="size-8"
            variant="ghost"
            aria-label="Copy logs"
            onClick={handleButtonClick2}
          >
            <Copy className="size-3.5" />
          </Button>
        </div>
      </CardHeader>
      {error && (
        <div className="border-b p-4">
          <Alert variant="destructive">
            <AlertDescription className="whitespace-pre-wrap break-words">
              {error}
            </AlertDescription>
          </Alert>
        </div>
      )}
      <CardContent className="bg-[#121a15] p-0 text-[#d1dfc9]">
        <pre
          ref={scroll}
          onScroll={handleScroll}
          data-testid="log-output"
          className="h-[420px] overflow-auto [overflow-anchor:none] p-5 font-mono text-xs leading-6"
        >
          {lines.length ? (
            lines.map((line) => (
              <div key={line.number} data-log-number={line.number}>
                <span className="mr-4 inline-block w-7 select-none text-right text-[#5d715c]">
                  {line.number}
                </span>
                {line.text}
              </div>
            ))
          ) : (
            <span className="text-[#7b9274]">Waiting for log output…</span>
          )}
        </pre>
      </CardContent>
    </FlushCard>
  );
}
