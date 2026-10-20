export type UpdateState = {
  target: string;
  reviewOpen: boolean;
  pass: string;
  confirm: string;
  approve: boolean;
};
export type UpdateAction =
  | { type: "target_changed"; value: string }
  | { type: "passphrase_changed"; value: string }
  | { type: "confirmation_changed"; value: string }
  | { type: "approval_changed"; value: boolean }
  | { type: "preview_succeeded" }
  | { type: "applied" };
export const initialUpdateState: UpdateState = {
  target: "",
  reviewOpen: false,
  pass: "",
  confirm: "",
  approve: false,
};
export function updateReducer(
  state: UpdateState,
  action: UpdateAction,
): UpdateState {
  switch (action.type) {
    case "target_changed":
      return { ...initialUpdateState, target: action.value };
    case "passphrase_changed":
      return { ...state, pass: action.value };
    case "confirmation_changed":
      return { ...state, confirm: action.value };
    case "approval_changed":
      return { ...state, approve: action.value };
    case "preview_succeeded":
      return { ...state, reviewOpen: true, confirm: "", approve: false };
    case "applied":
      return { ...state, reviewOpen: false, pass: "" };
  }
}
