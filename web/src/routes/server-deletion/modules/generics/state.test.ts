import { expect, it } from "vitest";

import {
  initialServerDeletionPageState,
  serverDeletionPageReducer,
} from "./state";

it("clears the typed confirmation and volume acknowledgement for each new inventory review", () => {
  const typed = {
    ...initialServerDeletionPageState,
    name: "server",
    ack: true,
    repair: true,
  };
  expect(serverDeletionPageReducer(typed, { type: "review_started" })).toEqual({
    name: "",
    ack: false,
    repair: true,
    action: "review",
  });
  expect(typed).toMatchObject({ name: "server", ack: true });
});
it("keeps an expired plan error selected while requiring fresh confirmation", () => {
  const confirming = serverDeletionPageReducer(
    { ...initialServerDeletionPageState, name: "server", ack: true },
    { type: "confirmation_started" },
  );
  expect(
    serverDeletionPageReducer(confirming, { type: "plan_expired" }),
  ).toMatchObject({ name: "", ack: false, action: "confirmation" });
  expect(
    serverDeletionPageReducer(confirming, { type: "retry_started" }).action,
  ).toBe("retry");
  expect(
    serverDeletionPageReducer(confirming, {
      type: "repair_changed",
      value: true,
    }).repair,
  ).toBe(true);
  expect(
    serverDeletionPageReducer(confirming, {
      type: "name_changed",
      value: "new",
    }).name,
  ).toBe("new");
  expect(
    serverDeletionPageReducer(confirming, { type: "ack_changed", value: false })
      .ack,
  ).toBe(false);
});
