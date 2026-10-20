import { expect, it } from "vitest";

import {
  initialDashboardAccessState,
  dashboardAccessReducer,
} from "./dashboard-state";
import { initialPasswordState, passwordReducer } from "./password-state";

it("clears all password credentials together after the server confirms success", () => {
  let state = passwordReducer(initialPasswordState, {
    type: "field_changed",
    field: "current",
    value: "old-test-password",
  });
  state = passwordReducer(state, {
    type: "field_changed",
    field: "password",
    value: "new-test-password",
  });
  state = passwordReducer(state, {
    type: "field_changed",
    field: "code",
    value: "123456",
  });
  expect(passwordReducer(state, { type: "saved" })).toEqual(
    initialPasswordState,
  );
  expect(state.code).toBe("123456");
});
it("drops the submitted hostname draft on success while retaining ACME consent inputs", () => {
  let state = dashboardAccessReducer(initialDashboardAccessState, {
    type: "domain_changed",
    value: "shipyard.test",
  });
  state = dashboardAccessReducer(state, {
    type: "email_changed",
    value: "admin@example.test",
  });
  state = dashboardAccessReducer(state, { type: "terms_changed", value: true });
  expect(dashboardAccessReducer(state, { type: "saved" })).toEqual({
    draft: null,
    email: "admin@example.test",
    accept: true,
  });
  expect(state.draft).toBe("shipyard.test");
});
