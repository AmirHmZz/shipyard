import type { Draft } from "./types";

export type HAProxyDraftState = {
  editedDraft: Draft | null;
  trackingJob: boolean;
};
export type HAProxyDraftAction =
  | { type: "edited"; draft: Draft | null; stopTracking: boolean }
  | { type: "save_started"; draft: Draft }
  | { type: "reloaded"; draft: Draft };
export const initialHAProxyDraftState: HAProxyDraftState = {
  editedDraft: null,
  trackingJob: false,
};
export function haproxyDraftReducer(
  state: HAProxyDraftState,
  action: HAProxyDraftAction,
): HAProxyDraftState {
  switch (action.type) {
    case "edited":
      return {
        editedDraft: action.draft,
        trackingJob: !action.stopTracking && state.trackingJob,
      };
    case "save_started":
      return { editedDraft: action.draft, trackingJob: true };
    case "reloaded":
      return { editedDraft: action.draft, trackingJob: false };
  }
}
