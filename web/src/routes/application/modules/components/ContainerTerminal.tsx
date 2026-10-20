import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";
import { Plug, Unplug } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import "@xterm/xterm/css/xterm.css";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getCSRF } from "@/lib/api";
export default function ContainerTerminal({
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
