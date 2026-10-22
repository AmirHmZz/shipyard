export type ShellState = {
  search: boolean;
  mobile: boolean;
  dark: boolean;
  collapsed: boolean;
};
export type ShellAction =
  | { type: "search_changed"; value: boolean }
  | { type: "search_toggled" }
  | { type: "mobile_changed"; value: boolean }
  | { type: "theme_toggled" }
  | { type: "sidebar_toggled" };
export function shellReducer(
  state: ShellState,
  action: ShellAction,
): ShellState {
  switch (action.type) {
    case "search_changed":
      return { ...state, search: action.value };
    case "search_toggled":
      return { ...state, search: !state.search };
    case "mobile_changed":
      return { ...state, mobile: action.value };
    case "theme_toggled":
      return { ...state, dark: !state.dark };
    case "sidebar_toggled":
      return { ...state, collapsed: !state.collapsed };
  }
}
