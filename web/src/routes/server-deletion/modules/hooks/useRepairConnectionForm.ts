import type { FormEvent } from "react";

import { useReducer } from "react";

import type { Resource } from "@/lib/api/types";

import { toastValidationError } from "@/lib/api/toaster";
import { describeError } from "@/lib/api/translate-error";

import {
  initialRepairState,
  repairReducer,
  serverConnectionSchema,
} from "../generics";
import { useRepairServerConnection } from "./useRepairServerConnection";

export function useRepairConnectionForm(server: Resource, onSaved: () => void) {
  const repair = useRepairServerConnection(server.id);
  const [state, dispatch] = useReducer(
    repairReducer,
    server,
    initialRepairState,
  );
  const busy = repair.isPending;
  const error = repair.error ? describeError(repair.error) : "";
  function setHost(value: string) {
    dispatch({ type: "field_changed", field: "host", value });
  }
  function setPort(value: string) {
    dispatch({ type: "field_changed", field: "port", value });
  }
  function setUser(value: string) {
    dispatch({ type: "field_changed", field: "user", value });
  }
  function setFingerprint(value: string) {
    dispatch({ type: "field_changed", field: "fingerprint", value });
  }
  function setCredential(value: string) {
    dispatch({ type: "field_changed", field: "credential", value });
  }
  function setAuth(value: string) {
    dispatch({ type: "auth_changed", value });
  }
  function submitRepair(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const parsed = serverConnectionSchema.safeParse({
      ...state,
      authMethod: state.auth,
    });
    if (!parsed.success) {
      toastValidationError(parsed.error);
      return;
    }
    const connection = parsed.data;
    repair.mutate(
      {
        host: connection.host,
        port: connection.port,
        user: connection.user,
        fingerprint: connection.fingerprint,
        authMethod: connection.authMethod,
        secrets: connection.credential
          ? {
              [connection.authMethod === "password"
                ? "password"
                : "private_key"]: connection.credential,
            }
          : {},
      },
      {
        onSuccess: () => {
          dispatch({ type: "saved" });
          onSaved();
        },
      },
    );
  }
  return {
    state,
    derived: { busy, error },
    handlers: {
      setHost,
      setPort,
      setUser,
      setFingerprint,
      setCredential,
      setAuth,
      submitRepair,
    },
  };
}
