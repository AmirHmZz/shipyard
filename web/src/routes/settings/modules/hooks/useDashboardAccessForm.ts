import { useReducer } from "react";

import { toastValidationError } from "@/lib/api/toaster";
import { describeError } from "@/lib/api/translate-error";
import { useConfigurationChanges } from "@/lib/configuration-state";

import type { DashboardAccessValues } from "../generics";

import {
  initialDashboardAccessState,
  dashboardAccessReducer,
  dashboardHostnameSchema,
} from "../generics";
import { useDashboardAccess } from "./useDashboardAccess";
import { useSaveDashboardAccess } from "./useSaveDashboardAccess";

export function useDashboardAccessForm() {
  const changes = useConfigurationChanges();
  const q = useDashboardAccess();
  const [state, dispatch] = useReducer(
    dashboardAccessReducer,
    initialDashboardAccessState,
  );
  const saveAccess = useSaveDashboardAccess();
  const busy = saveAccess.isPending;
  const error = saveAccess.error ? describeError(saveAccess.error) : "";
  function setDraft(value: string) {
    dispatch({ type: "domain_changed", value });
  }
  function setEmail(value: string) {
    dispatch({ type: "email_changed", value });
  }
  function setAccept(value: boolean) {
    dispatch({ type: "terms_changed", value });
  }
  function save(retry = false) {
    const current = q.data;
    if (!current || busy) return;
    saveAccess.reset();
    let payload: DashboardAccessValues["payload"] = {
      version: current.version,
    };
    if (!retry) {
      const parsed = dashboardHostnameSchema(current.acmeConfigured).safeParse({
        version: current.version,
        domain: state.draft ?? current.domain,
        acmeEmail: state.email,
        acceptTos: state.accept,
      });
      if (!parsed.success) {
        toastValidationError(parsed.error);
        return;
      }
      payload = current.acmeConfigured
        ? { version: parsed.data.version, domain: parsed.data.domain }
        : parsed.data;
    }
    saveAccess.mutate(
      { retry, payload },
      {
        onSuccess: () => {
          dispatch({ type: "saved" });
          changes.saved();
        },
      },
    );
  }
  return {
    state,
    derived: { q, busy, error },
    handlers: { setDraft, setEmail, setAccept, save },
  };
}
