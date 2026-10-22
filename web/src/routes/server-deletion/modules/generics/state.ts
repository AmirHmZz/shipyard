export type ServerDeletionPageState = {
  name: string;
  ack: boolean;
  repair: boolean;
  action: "review" | "confirmation" | "retry" | null;
};
export type ServerDeletionPageAction =
  | { type: "name_changed"; value: string }
  | { type: "ack_changed"; value: boolean }
  | { type: "repair_changed"; value: boolean }
  | { type: "review_started" }
  | { type: "confirmation_started" }
  | { type: "plan_expired" }
  | { type: "retry_started" };
export const initialServerDeletionPageState: ServerDeletionPageState = {
  name: "",
  ack: false,
  repair: false,
  action: null,
};
export function serverDeletionPageReducer(
  state: ServerDeletionPageState,
  action: ServerDeletionPageAction,
): ServerDeletionPageState {
  switch (action.type) {
    case "name_changed":
      return { ...state, name: action.value };
    case "ack_changed":
      return { ...state, ack: action.value };
    case "repair_changed":
      return { ...state, repair: action.value };
    case "review_started":
      return { ...state, name: "", ack: false, action: "review" };
    case "confirmation_started":
      return { ...state, action: "confirmation" };
    case "plan_expired":
      return { ...state, name: "", ack: false };
    case "retry_started":
      return { ...state, action: "retry" };
  }
}
