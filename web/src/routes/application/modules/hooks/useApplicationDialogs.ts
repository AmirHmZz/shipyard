import { useReducer } from "react";

import type { Deployment } from "@/lib/api/types";

import {
  initialApplicationDialogState,
  applicationDialogReducer,
} from "../generics";

export function useApplicationDialogs() {
  const [state, dispatch] = useReducer(
    applicationDialogReducer,
    initialApplicationDialogState,
  );
  function setDeleting(value: boolean) {
    dispatch({ type: "deletion_changed", value });
  }
  function setConfirmAction(value: string) {
    dispatch({ type: "confirmation_changed", value });
  }
  function setDeleteDeployment(value: Deployment | null) {
    dispatch({ type: "deployment_changed", value });
  }
  return {
    state,
    handlers: { setDeleting, setConfirmAction, setDeleteDeployment },
  };
}
