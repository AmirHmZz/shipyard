import type { editor } from "monaco-editor";

export type ComposeEditorState = {
  instance: editor.IStandaloneCodeEditor | null;
  wrap: boolean;
  dark: boolean;
};
export type ComposeEditorAction =
  | { type: "mounted"; instance: editor.IStandaloneCodeEditor }
  | { type: "wrap_toggled" }
  | { type: "theme_changed"; value: boolean };
export function initialComposeEditorState(dark: boolean): ComposeEditorState {
  return { instance: null, wrap: true, dark };
}
export function composeEditorReducer(
  state: ComposeEditorState,
  action: ComposeEditorAction,
): ComposeEditorState {
  switch (action.type) {
    case "mounted":
      return { ...state, instance: action.instance };
    case "wrap_toggled":
      return { ...state, wrap: !state.wrap };
    case "theme_changed":
      return { ...state, dark: action.value };
  }
}
