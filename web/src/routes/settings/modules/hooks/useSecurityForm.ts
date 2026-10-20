import type * as React from "react";

import { useState } from "react";

import { toastValidationError } from "@/lib/api/toaster";

import {
  totpCodeSchema,
  totpDisableSchema,
  totpPasswordSchema,
} from "../generics";
import { useDisableTOTP } from "./useDisableTOTP";
import { useEnableTOTP } from "./useEnableTOTP";
import { useStartTOTP } from "./useStartTOTP";
export function useSecurityForm() {
  function changePassword(e: React.ChangeEvent<HTMLInputElement>) {
    return setPassword(e.target.value);
  }
  function changeCode(e: React.ChangeEvent<HTMLInputElement>) {
    return setCode(e.target.value);
  }

  const disable = useDisableTOTP();
  const start = useStartTOTP();
  const enable = useEnableTOTP();
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const setup = start.data;
  const recovery = enable.data?.recoveryCodes ?? [];
  function confirmAuthenticator() {
    if (enable.isPending) return;
    const parsed = totpCodeSchema.safeParse({ code });
    if (!parsed.success) {
      toastValidationError(parsed.error);
      return;
    }
    enable.mutate(parsed.data, {
      onSuccess: () => {
        start.reset();
        setPassword("");
      },
    });
  }
  function disableAuthenticator() {
    if (disable.isPending) return;
    const parsed = totpDisableSchema.safeParse({ password, code });
    if (!parsed.success) {
      toastValidationError(parsed.error);
      return;
    }
    disable.mutate(parsed.data, {
      onSuccess: () => {
        setPassword("");
        setCode("");
      },
    });
  }
  function startAuthenticator() {
    if (start.isPending) return;
    const parsed = totpPasswordSchema.safeParse({ password });
    if (!parsed.success) {
      toastValidationError(parsed.error);
      return;
    }
    start.mutate(parsed.data);
  }

  return {
    state: { password, code },
    derived: { disable, start, enable, setup, recovery },
    handlers: {
      changePassword,
      changeCode,
      confirmAuthenticator,
      disableAuthenticator,
      startAuthenticator,
    },
  };
}
