import type * as React from "react";

import { useResourceForm } from "@/components/resource-forms/controller";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

import type { ResourceFieldProps } from "../types";

export function SecretResourceField({ f, existing }: ResourceFieldProps) {
  const {
    state: { secrets },
    actions: { setSecrets },
    meta: { formId },
  } = useResourceForm();
  const password = f.type === "password";
  const Control = password ? Input : Textarea;
  const stored = existing?.secretKeys.includes(f.key);
  return (
    <Control
      id={formId + "-" + f.key}
      type={password ? "password" : undefined}
      autoComplete={password ? "new-password" : undefined}
      className={password ? undefined : "min-h-20 font-mono text-xs"}
      value={secrets[f.key] || ""}
      onChange={(
        event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
      ) =>
        setSecrets((current) => ({ ...current, [f.key]: event.target.value }))
      }
      placeholder={
        stored
          ? "Stored securely. Leave untouched to retain."
          : password
            ? "Enter SSH password"
            : "Paste credential"
      }
    />
  );
}
