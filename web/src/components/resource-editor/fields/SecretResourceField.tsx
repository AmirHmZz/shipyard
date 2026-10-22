import type * as React from "react";

import { useResourceForm } from "@/components/resource-forms/controller";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

import type { ResourceFieldProps } from "../types";

export type SecretResourceFieldProps = ResourceFieldProps;
export function SecretResourceField({
  f,
  existing,
  kind,
}: SecretResourceFieldProps) {
  function handleControlChange(
    event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) {
    return setSecret(f.key, event.target.value);
  }

  const {
    state: { secrets },
    handlers: { setSecret },
    derived: { formId },
  } = useResourceForm();
  const password = f.type === "password";
  const Control = password ? Input : Textarea;
  const stored = existing?.secretKeys.includes(f.key);
  let placeholder = password ? "Enter SSH password" : "Paste credential";
  if (kind === "registry") placeholder = "Enter password or token";
  if (stored) placeholder = "Stored securely. Leave untouched to retain.";
  return (
    <Control
      id={formId + "-" + f.key}
      type={password ? "password" : undefined}
      autoComplete={password ? "new-password" : undefined}
      className={password ? undefined : "min-h-20 font-mono text-xs"}
      value={secrets[f.key] || ""}
      onChange={handleControlChange}
      placeholder={placeholder}
    />
  );
}
