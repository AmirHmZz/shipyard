import type { FormEvent } from "react";

import { InputField } from "@/components/InputField";
import { Button } from "@/components/ui/button";
import { DialogFooter } from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";

import type { McpProject } from "../generics";

import { McpProjectPicker } from "./McpProjectPicker";

export type McpTokenFormProps = {
  mode: "create" | "edit" | "recreate";
  projects: McpProject[];
  projectIds: string[];
  pending: boolean;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onCancel: () => void;
};
export function McpTokenForm({
  mode,
  projects,
  projectIds,
  pending,
  onSubmit,
  onCancel,
}: McpTokenFormProps) {
  const labels = {
    create: "Create token",
    edit: "Save access",
    recreate: "Recreate token",
  };
  return (
    <form onSubmit={onSubmit} className="flex min-w-0 flex-col gap-4">
      {mode === "create" && (
        <InputField
          label="Token name"
          labelProps={{ htmlFor: "mcp-token-name" }}
          inputProps={{
            id: "mcp-token-name",
            name: "name",
            required: true,
            maxLength: 80,
            disabled: pending,
            placeholder: "e.g. Incident triage agent",
          }}
        />
      )}
      {mode !== "edit" && (
        <InputField
          label={
            mode === "recreate" ? "New lifetime (days)" : "Expires in days"
          }
          labelProps={{ htmlFor: "mcp-expiry" }}
          inputProps={{
            id: "mcp-expiry",
            name: "expiryDays",
            type: "number",
            defaultValue: 30,
            min: 1,
            max: 365,
            required: true,
            disabled: pending,
          }}
        />
      )}
      {mode !== "recreate" && (
        <McpProjectPicker
          projects={projects}
          projectIds={projectIds}
          pending={pending}
        />
      )}
      <DialogFooter>
        <Button
          type="button"
          variant="outline"
          onClick={onCancel}
          disabled={pending}
        >
          Cancel
        </Button>
        <Button
          type="submit"
          disabled={pending || (mode !== "recreate" && projects.length === 0)}
        >
          {pending && <Spinner />}
          {labels[mode]}
        </Button>
      </DialogFooter>
    </form>
  );
}
