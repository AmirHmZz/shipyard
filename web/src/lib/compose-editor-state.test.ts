import { expect, it } from "vitest";

import {
  initialComposeEditorState,
  composeEditorReducer,
} from "./compose-editor-state";

it("retains word-wrap preference when the observed page theme changes", () => {
  const initial = initialComposeEditorState(false);
  const unwrapped = composeEditorReducer(initial, { type: "wrap_toggled" });
  expect(
    composeEditorReducer(unwrapped, { type: "theme_changed", value: true }),
  ).toEqual({ instance: null, wrap: false, dark: true });
  expect(initial.wrap).toBe(true);
});
