import type { Deployment } from "@/lib/api/types";

export type ApplicationDialogState = {
  deleting: boolean;
  confirmAction: string;
  deleteDeployment: Deployment | null;
};
export type ApplicationDialogAction =
  | { type: "deletion_changed"; value: boolean }
  | { type: "confirmation_changed"; value: string }
  | { type: "deployment_changed"; value: Deployment | null };
export const initialApplicationDialogState: ApplicationDialogState = {
  deleting: false,
  confirmAction: "",
  deleteDeployment: null,
};
export function applicationDialogReducer(
  state: ApplicationDialogState,
  action: ApplicationDialogAction,
): ApplicationDialogState {
  switch (action.type) {
    case "deletion_changed":
      return { ...state, deleting: action.value };
    case "confirmation_changed":
      return { ...state, confirmAction: action.value };
    case "deployment_changed":
      return { ...state, deleteDeployment: action.value };
  }
}
