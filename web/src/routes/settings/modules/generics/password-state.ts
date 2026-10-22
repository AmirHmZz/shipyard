export type PasswordState = { current: string; password: string; code: string };
export type PasswordAction =
  | { type: "field_changed"; field: keyof PasswordState; value: string }
  | { type: "saved" };
export const initialPasswordState: PasswordState = {
  current: "",
  password: "",
  code: "",
};
export function passwordReducer(
  state: PasswordState,
  action: PasswordAction,
): PasswordState {
  switch (action.type) {
    case "field_changed":
      return { ...state, [action.field]: action.value };
    case "saved":
      return initialPasswordState;
  }
}
