import type * as React from "react";

import { InputField } from "@/components/InputField";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

import { usePasswordForm } from "../hooks";

export function PasswordSettings() {
  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    return setCurrent(e.target.value);
  }
  function handleInputChange2(e: React.ChangeEvent<HTMLInputElement>) {
    return setPassword(e.target.value);
  }
  function handleInputChange3(e: React.ChangeEvent<HTMLInputElement>) {
    return setCode(e.target.value);
  }

  const { state, derived, handlers } = usePasswordForm();
  const { current, password, code } = state;
  const { busy } = derived;
  const { setCurrent, setPassword, setCode, submitPassword } = handlers;
  return (
    <Card className="mt-5 max-w-2xl shadow-none">
      <CardHeader>
        <CardTitle className="text-base">Change password</CardTitle>
        <CardDescription>Other sessions will be signed out.</CardDescription>
      </CardHeader>
      <CardContent>
        <form className="space-y-4" onSubmit={submitPassword}>
          <InputField
            label={<>Current password</>}
            labelProps={{ htmlFor: "password-current" }}
            inputProps={{
              id: "password-current",
              autoComplete: "current-password",
              type: "password",
              value: current,
              onChange: handleInputChange,
              required: true,
            }}
          />
          <InputField
            label={<>New password</>}
            labelProps={{ htmlFor: "password-new" }}
            inputProps={{
              id: "password-new",
              autoComplete: "new-password",
              type: "password",
              minLength: 12,
              value: password,
              onChange: handleInputChange2,
              required: true,
            }}
          />
          <InputField
            label={<>Authenticator / recovery code (if enabled)</>}
            labelProps={{ htmlFor: "password-code" }}
            inputProps={{
              id: "password-code",
              autoComplete: "one-time-code",
              value: code,
              onChange: handleInputChange3,
            }}
          />
          <Button disabled={busy}>Change password</Button>
        </form>
      </CardContent>
    </Card>
  );
}
