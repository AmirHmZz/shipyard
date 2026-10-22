import type * as React from "react";

import { useResourceForm } from "@/components/resource-forms/controller";
import { Input } from "@/components/ui/input";
import {
  InputGroup,
  InputGroupInput,
  InputGroupAddon,
  InputGroupText,
} from "@/components/ui/input-group";
import { Textarea } from "@/components/ui/textarea";
import { inputNumberSchema } from "@/lib/schemas/coercion";

import type { ResourceFieldProps } from "../types";

export type ScalarResourceFieldProps = ResourceFieldProps;
export function ScalarResourceField({ f, kind }: ScalarResourceFieldProps) {
  function handleInputGroupInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    return update(f.key, e.target.value);
  }
  function handleTextareaChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    return update(f.key, e.target.value);
  }
  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    return update(
      f.key,
      f.type === "number"
        ? inputNumberSchema.parse(e.target.value)
        : e.target.value,
    );
  }

  const {
    state: { data },
    handlers: { update },
    derived: { formId },
  } = useResourceForm();
  const fieldValue = data[f.key];
  if (kind === "application" && (f.key === "context" || f.key === "file"))
    return (
      <InputGroup>
        <InputGroupInput
          id={`${formId}-${f.key}`}
          value={String(data[f.key] ?? "")}
          onChange={handleInputGroupInputChange}
        />
        <InputGroupAddon>
          <InputGroupText>repository_root/</InputGroupText>
        </InputGroupAddon>
      </InputGroup>
    );
  if (f.type === "json")
    return (
      <Textarea
        id={`${formId}-${f.key}`}
        className="font-mono text-xs"
        value={
          typeof data[f.key] === "string"
            ? String(data[f.key])
            : JSON.stringify(data[f.key] || {}, null, 2)
        }
        onChange={handleTextareaChange}
      />
    );
  return (
    <Input
      id={`${formId}-${f.key}`}
      type={f.type === "number" ? "number" : "text"}
      value={
        Array.isArray(fieldValue)
          ? fieldValue.join(", ")
          : String(fieldValue ?? "")
      }
      onChange={handleInputChange}
    />
  );
}
