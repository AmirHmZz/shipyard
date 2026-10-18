import { Input } from "@/components/ui/input";
import {
  InputGroup,
  InputGroupInput,
  InputGroupAddon,
  InputGroupText,
} from "@/components/ui/input-group";
import { Textarea } from "@/components/ui/textarea";
import { useResourceForm } from "@/components/resource-forms/controller";
import type { ResourceFieldProps } from "../types";

export function ScalarResourceField({ f, kind }: ResourceFieldProps) {
  const {
    state: { data },
    actions: { update },
    meta: { formId },
  } = useResourceForm();
  if (kind === "application" && (f.key === "context" || f.key === "file"))
    return (
      <InputGroup>
        <InputGroupInput
          id={`${formId}-${f.key}`}
          value={String(data[f.key] ?? "")}
          onChange={(e) => update(f.key, e.target.value)}
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
        onChange={(e) => update(f.key, e.target.value)}
      />
    );
  return (
    <Input
      id={`${formId}-${f.key}`}
      type={f.type === "number" ? "number" : "text"}
      value={
        Array.isArray(data[f.key])
          ? (data[f.key] as string[]).join(", ")
          : String(data[f.key] ?? "")
      }
      onChange={(e) =>
        update(
          f.key,
          f.type === "number" ? Number(e.target.value) : e.target.value,
        )
      }
    />
  );
}
