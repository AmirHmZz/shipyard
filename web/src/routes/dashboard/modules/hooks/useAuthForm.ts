import type { ChangeEvent, FormEvent } from "react";

import { useState } from "react";
import { useNavigate } from "react-router";

import { toastValidationError } from "@/lib/api/toaster";

import { authFormSchema } from "../generics";
import { describeAuthError } from "../utils";
import { useSetupStatus } from "./useSetupStatus";
import { useSubmitAuth } from "./useSubmitAuth";

export function useAuthForm() {
  const navigate = useNavigate();
  const status = useSetupStatus();
  const token = new URLSearchParams(location.search).get("token") || "";
  const [form, setForm] = useState(() => ({
    email: "",
    password: "",
    name: "",
    code: "",
    token,
  }));
  const setup = status.data?.setupRequired && !token;
  let mode: "login" | "setup" | "accept" = "login";
  if (setup) mode = "setup";
  if (token) mode = "accept";
  const signIn = useSubmitAuth(mode);
  const busy = signIn.isPending;
  const error = describeAuthError(signIn.error);
  let title = "Welcome back";
  let description = "Sign in to your deployment workspace.";
  let submitLabel = "Sign in";
  if (setup) {
    title = "Welcome aboard";
    description = "Create the first administrator account for your Shipyard.";
    submitLabel = "Create workspace";
  }
  if (token) {
    title = "Join your team";
    description =
      "Already have an account? Use your current password and enter a code if two-factor authentication is enabled.";
    submitLabel = "Accept invitation";
  }
  function changeField(event: ChangeEvent<HTMLInputElement>) {
    const key = event.currentTarget.dataset.authField;
    const value = event.currentTarget.value;
    if (
      key !== "name" &&
      key !== "email" &&
      key !== "password" &&
      key !== "token" &&
      key !== "code"
    )
      return;
    setForm((current) => ({ ...current, [key]: value }));
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const parsed = authFormSchema(mode).safeParse(form);
    if (!parsed.success) {
      toastValidationError(parsed.error);
      return;
    }
    signIn.mutate(parsed.data, {
      onSuccess: () => {
        if (token) navigate("/", { replace: true });
      },
    });
  }
  return {
    state: { form },
    derived: {
      token,
      setup,
      status,
      busy,
      error,
      title,
      description,
      submitLabel,
    },
    handlers: { changeField, submit },
  };
}
