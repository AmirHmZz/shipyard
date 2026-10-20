import type { FormEvent } from "react";

import { useReducer } from "react";

import { toastValidationError } from "@/lib/api/toaster";

import {
  initialPasswordState,
  passwordReducer,
  passwordFormSchema,
} from "../generics";
import { useChangePassword } from "./useChangePassword";

export function usePasswordForm() {
  const change = useChangePassword();
  const [state, dispatch] = useReducer(passwordReducer, initialPasswordState);
  const busy = change.isPending;
  function setCurrent(value: string) {
    dispatch({ type: "field_changed", field: "current", value });
  }
  function setPassword(value: string) {
    dispatch({ type: "field_changed", field: "password", value });
  }
  function setCode(value: string) {
    dispatch({ type: "field_changed", field: "code", value });
  }
  function submitPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const parsed = passwordFormSchema.safeParse(state);
    if (!parsed.success) {
      toastValidationError(parsed.error);
      return;
    }
    change.mutate(parsed.data, {
      onSuccess: () => dispatch({ type: "saved" }),
    });
  }
  return {
    state,
    derived: { busy },
    handlers: { setCurrent, setPassword, setCode, submitPassword },
  };
}
