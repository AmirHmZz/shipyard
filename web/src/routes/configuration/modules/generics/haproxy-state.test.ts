import { expect, it } from "vitest";

import { initialHAProxyDraftState, haproxyDraftReducer } from "./haproxy-state";

it("tracks a submitted apply while retaining its draft, then allows a fresh edit or reload", () => {
  const draft = { version: 2, bindings: {} };
  const pending = haproxyDraftReducer(initialHAProxyDraftState, {
    type: "save_started",
    draft,
  });
  expect(pending).toEqual({ editedDraft: draft, trackingJob: true });
  expect(
    haproxyDraftReducer(pending, { type: "edited", draft, stopTracking: true })
      .trackingJob,
  ).toBe(false);
  expect(haproxyDraftReducer(pending, { type: "reloaded", draft })).toEqual({
    editedDraft: draft,
    trackingJob: false,
  });
  expect(initialHAProxyDraftState.editedDraft).toBeNull();
});
