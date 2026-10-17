import { useEffect, useRef, useState } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";
import { Copy, Plug, Unplug } from "lucide-react";
import { toast } from "sonner";
import { getCSRF, type Deployment } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { logText } from "@/lib/log-text";
import { StateBadge } from "@/components/shared";
import { Alert, AlertDescription } from "@/components/ui/alert";
export function LogStream({
  deploymentId,
  applicationId,
  containers = [],
}: {
  deploymentId?: string;
  applicationId?: string;
  containers?: string[];
}) {
  const [lines, setLines] = useState<string[]>([]);
  const [state, setState] = useState("connecting");
  const [error, setError] = useState("");
  const [selected, setSelected] = useState("");
  const scroll = useRef<HTMLPreElement>(null);
  useEffect(() => {
    setLines([]);
    setState("connecting");
    setError("");
    const endpoint = deploymentId
      ? `/deployments/${deploymentId}/events`
      : `/applications/${applicationId}/logs?container=${selected || containers[0] || ""}`;
    const source = new EventSource("/api/v1" + endpoint);
    source.addEventListener("log", (event) => {
      const data = JSON.parse((event as MessageEvent).data) as {
        message: string;
      };
      setLines((old) => [...old.slice(-1999), logText(data.message)]);
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
    return () => source.close();
  }, [deploymentId, applicationId, selected, containers.join(",")]);
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
            <Select
              value={selected || containers[0]}
              onValueChange={setSelected}
            >
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
          <Button
            size="icon"
            className="size-8"
            variant="ghost"
            aria-label="Copy logs"
            onClick={() => {
              void navigator.clipboard.writeText(lines.join("\n"));
              toast.success("Logs copied");
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
            lines.map((line, i) => (
              <div key={i}>
                <span className="mr-4 inline-block w-7 select-none text-right text-[#5d715c]">
                  {i + 1}
                </span>
                {line}
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
export function ContainerTerminal({
  applicationId,
  containers,
}: {
  applicationId: string;
  containers: string[];
}) {
  const [container, setContainer] = useState(containers[0] || "");
  const [connected, setConnected] = useState(false);
  const [status, setStatus] = useState("disconnected");
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!connected || !host.current || !container) return;
    const terminal = new Terminal({
      fontSize: 13,
      fontFamily: "Consolas,monospace",
      cursorBlink: true,
      theme: {
        background: "#121a15",
        foreground: "#d1dfc9",
        cursor: "#a8c98f",
      },
      allowProposedApi: false,
    });
    const fit = new FitAddon();
    terminal.loadAddon(fit);
    terminal.open(host.current);
    fit.fit();
    const scheme = location.protocol === "https:" ? "wss" : "ws";
    const socket = new WebSocket(
      `${scheme}://${location.host}/api/v1/applications/${applicationId}/terminal?container=${encodeURIComponent(container)}&csrf=${encodeURIComponent(getCSRF())}`,
    );
    socket.binaryType = "arraybuffer";
    socket.onopen = () => {
      setStatus("connected");
      socket.send(
        JSON.stringify({
          type: "resize",
          rows: terminal.rows,
          cols: terminal.cols,
        }),
      );
      terminal.focus();
    };
    socket.onmessage = (event) =>
      terminal.write(
        typeof event.data === "string"
          ? event.data
          : new Uint8Array(event.data as ArrayBuffer),
      );
    socket.onclose = (event) => {
      setStatus("disconnected");
      terminal.writeln(`\r\n[${event.reason || "Connection closed"}]`);
    };
    socket.onerror = () => {
      setStatus("failed");
      terminal.writeln(
        "\r\n[Unable to connect. Check permissions and container status.]",
      );
    };
    const subscription = terminal.onData((data) => {
      if (socket.readyState === WebSocket.OPEN)
        socket.send(JSON.stringify({ type: "data", data }));
    });
    const observer = new ResizeObserver(() => {
      fit.fit();
      if (socket.readyState === WebSocket.OPEN)
        socket.send(
          JSON.stringify({
            type: "resize",
            rows: terminal.rows,
            cols: terminal.cols,
          }),
        );
    });
    observer.observe(host.current);
    return () => {
      subscription.dispose();
      observer.disconnect();
      socket.close();
      terminal.dispose();
    };
  }, [connected, container, applicationId]);
  return (
    <Card className="gap-0 overflow-hidden py-0 shadow-none">
      <CardHeader className="flex flex-row items-center justify-between border-b py-4">
        <div>
          <CardTitle className="text-sm">Container terminal</CardTitle>
          <p className="mt-1 text-xs text-muted-foreground">
            Interactive access is scoped to this application and recorded in the
            audit log.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select
            value={container}
            onValueChange={(v) => {
              setConnected(false);
              setContainer(v);
            }}
          >
            <SelectTrigger className="w-36">
              <SelectValue placeholder="Container" />
            </SelectTrigger>
            <SelectContent>
              {containers.map((id) => (
                <SelectItem key={id} value={id}>
                  {id.slice(0, 12)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant={connected ? "outline" : "default"}
            disabled={!container}
            onClick={() => setConnected((v) => !v)}
          >
            {connected ? <Unplug /> : <Plug />}
            {connected ? "Disconnect" : "Connect"}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="bg-[#121a15] p-0">
        <div ref={host} className="h-[440px]" />
        {!connected && (
          <p className="px-5 pb-5 font-mono text-xs text-[#7b9274]">
            Select a container and connect to open its shell.
          </p>
        )}
        <div className="border-t border-white/10 px-4 py-2 font-mono text-[10px] text-[#7b9274]">
          {status.toUpperCase()}
        </div>
      </CardContent>
    </Card>
  );
}
