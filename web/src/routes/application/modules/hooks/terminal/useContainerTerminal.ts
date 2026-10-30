import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";
import { useEffect, useRef, useReducer } from "react";

import { getCSRF } from "@/lib/api/csrf";

import { initialTerminalState, terminalReducer } from "../../generics";
export function useContainerTerminal(
  applicationId: string,
  containers: string[],
) {
  const [{ container, connected, status }, dispatch] = useReducer(
    terminalReducer,
    containers[0] || "",
    initialTerminalState,
  );
  const host = useRef<HTMLDivElement>(null);
  // Reconcile the reducer before committing effects so a removed container can
  // never open a new connection while the old terminal is being cleaned up.
  if (!containers.includes(container) && (container || containers.length)) {
    dispatch({ type: "container_changed", value: containers[0] || "" });
  }
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
    let active = true;
    socket.binaryType = "arraybuffer";
    socket.onopen = () => {
      if (!active) return;
      dispatch({ type: "status_changed", value: "connected" });
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
      if (!active) return;
      dispatch({ type: "status_changed", value: "disconnected" });
      terminal.writeln(`\r\n[${event.reason || "Connection closed"}]`);
    };
    socket.onerror = () => {
      if (!active) return;
      dispatch({ type: "status_changed", value: "failed" });
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
      active = false;
      subscription.dispose();
      observer.disconnect();
      socket.close();
      terminal.dispose();
    };
  }, [connected, container, applicationId]);

  function selectContainer(value: string) {
    dispatch({ type: "container_changed", value });
  }
  function toggleConnection() {
    dispatch({ type: "connection_toggled" });
  }
  return {
    state: { container, connected, status },
    derived: { host },
    handlers: { selectContainer, toggleConnection },
  };
}
