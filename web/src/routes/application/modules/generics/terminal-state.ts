export type TerminalState = {
  container: string;
  connected: boolean;
  status: "connected" | "disconnected" | "failed";
};
export type TerminalAction =
  | { type: "container_changed"; value: string }
  | { type: "connection_toggled" }
  | { type: "status_changed"; value: TerminalState["status"] };
export function initialTerminalState(container: string): TerminalState {
  return { container, connected: false, status: "disconnected" };
}
export function terminalReducer(
  state: TerminalState,
  action: TerminalAction,
): TerminalState {
  switch (action.type) {
    case "container_changed":
      return { ...state, container: action.value, connected: false };
    case "connection_toggled":
      return { ...state, connected: !state.connected };
    case "status_changed":
      return { ...state, status: action.value };
  }
}
