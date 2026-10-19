import { StateBadge } from "@/components/shared";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { type Deployment } from "@/lib/api";
import { LogBuffer, type LogLine } from "@/lib/log-buffer";
import { logText } from "@/lib/log-text";
import { Copy, Eraser } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
export function LogStream({
  deploymentId,
  applicationId,
  containers = [],
}: {
  deploymentId?: string;
  applicationId?: string;
  containers?: string[];
}) {
  const [lines, setLines] = useState<LogLine[]>([]);
  const [state, setState] = useState("connecting");
  const [error, setError] = useState("");
  const [selected, setSelected] = useState("");
  const scroll = useRef<HTMLPreElement>(null);
  const buffer = useRef<LogBuffer | null>(null);
  const effectiveContainer = containers.includes(selected)
    ? selected
    : containers[0] || "";
  const endpoint = deploymentId
    ? `/deployments/${deploymentId}/events`
    : `/applications/${applicationId}/logs?container=${encodeURIComponent(effectiveContainer)}`;
  useEffect(() => {
    setLines([]);
    setState("connecting");
    setError("");
    const current = new LogBuffer(setLines);
    buffer.current = current;
    const source = new EventSource("/api/v1" + endpoint);
    let lastEventID = 0;
    source.addEventListener("log", (event) => {
      if (deploymentId) {
        const id = Number((event as MessageEvent).lastEventId);
        if (id > 0) {
          if (id <= lastEventID) return;
          lastEventID = id;
        }
      }

      const data = JSON.parse((event as MessageEvent).data) as {
        message: string;
      };
      current.push(logText(data.message));
      setState("connected");
    });
    source.addEventListener("status", (event) => {
      const d = JSON.parse((event as MessageEvent).data) as Deployment;
      setState(d.state);
      setError(d.error || "");
      if (["healthy", "failed", "recovery_failed"].includes(d.state))
        source.close();
    });
    source.onerror = () => {
      if (source.readyState === EventSource.CLOSED) setState("ended");
      else setState("reconnecting");
    };
    return () => {
      source.close();
      current.dispose();
      if (buffer.current === current) buffer.current = null;
    };
  }, [endpoint, deploymentId]);
  useEffect(() => {
    scroll.current?.scrollTo({ top: scroll.current.scrollHeight });
  }, [lines]);
  return (
    <Card className="gap-0 overflow-hidden py-0 shadow-none">
      <CardHeader className="flex min-h-14 flex-row flex-wrap items-center justify-between gap-2 border-b px-4 py-2.5 [.border-b]:pb-2.5">
        <CardTitle className="text-sm font-semibold leading-6">
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
          {!deploymentId && (
            <Button
              size="icon"
              className="size-8"
              variant="ghost"
              aria-label="Clear logs"
              onClick={() => buffer.current?.clear()}
            >
              <Eraser className="size-3.5" />
            </Button>
          )}
          <Button
            size="icon"
            className="size-8"
            variant="ghost"
            aria-label="Copy logs"
            onClick={async () => {
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
            }}
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
          className="h-[420px] overflow-auto p-5 font-mono text-xs leading-6"
        >
          {lines.length ? (
            lines.map((line) => (
              <div
                key={line.number}
                style={{
                  contentVisibility: "auto",
                  containIntrinsicSize: "auto 24px",
                }}
              >
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
    </Card>
  );
}
