export type VariableState = {
  key: string;
  value: string;
  scope: string;
  secret: boolean;
  editing: string;
  remove: string;
};
export type VariableAction =
  | { type: "key_changed"; value: string }
  | { type: "value_changed"; value: string }
  | { type: "scope_changed"; value: string }
  | { type: "secret_changed"; value: boolean }
  | { type: "removal_changed"; value: string }
  | {
      type: "editing_started";
      key: string;
      value: string;
      scope: string;
      secret: boolean;
      name: string;
    }
  | { type: "reset" }
  | { type: "saved"; clearEditor: boolean };
export const initialVariableState: VariableState = {
  key: "",
  value: "",
  scope: "env:",
  secret: false,
  editing: "",
  remove: "",
};
export function variableReducer(
  state: VariableState,
  action: VariableAction,
): VariableState {
  switch (action.type) {
    case "key_changed":
      return { ...state, key: action.value };
    case "value_changed":
      return { ...state, value: action.value };
    case "scope_changed":
      return { ...state, scope: action.value };
    case "secret_changed":
      return { ...state, secret: action.value };
    case "removal_changed":
      return { ...state, remove: action.value };
    case "editing_started":
      return {
        ...state,
        key: action.key,
        value: action.value,
        scope: action.scope,
        secret: action.secret,
        editing: action.name,
      };
    case "reset":
      return {
        ...initialVariableState,
        scope: state.scope,
        remove: state.remove,
      };
    case "saved":
      return action.clearEditor
        ? { ...initialVariableState, scope: state.scope }
        : { ...state, remove: "" };
  }
}
