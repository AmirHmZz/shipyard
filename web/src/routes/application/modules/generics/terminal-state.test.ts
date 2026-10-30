import { expect, it } from "vitest";

import { initialTerminalState, terminalReducer } from "./terminal-state";

it("disconnects and resets status when choosing another container", () => {
  const initial = initialTerminalState("one");
  const requested = terminalReducer(initial, { type: "connection_toggled" });
  const connected = terminalReducer(requested, {
    type: "status_changed",
    value: "connected",
  });
  expect(
    terminalReducer(connected, { type: "container_changed", value: "two" }),
  ).toEqual({ container: "two", connected: false, status: "disconnected" });
  expect(
    terminalReducer(connected, { type: "status_changed", value: "failed" })
      .connected,
  ).toBe(true);
  expect(initial.connected).toBe(false);
});
