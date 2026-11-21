import type { FormEvent } from "react";

import { InputField } from "@/components/InputField";
import { Button } from "@/components/ui/button";

import type { McpProject } from "../generics";

export type McpTokenFormProps = {
  projects: McpProject[];
  pending: boolean;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
};
export function McpTokenForm({
  projects,
  pending,
  onSubmit,
}: McpTokenFormProps) {
  return (
    <form onSubmit={onSubmit} className="flex max-w-xl flex-col gap-4">
      <InputField
        label="Token name"
        labelProps={{ htmlFor: "mcp-token-name" }}
        inputProps={{
          id: "mcp-token-name",
          name: "name",
          required: true,
          maxLength: 80,
        }}
      />
      <InputField
        label="Expires in days"
        labelProps={{ htmlFor: "mcp-expiry" }}
        inputProps={{
          id: "mcp-expiry",
          name: "expiryDays",
          type: "number",
          defaultValue: 30,
          min: 1,
          max: 365,
          required: true,
        }}
      />
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-sm font-medium">Allowed projects</legend>
        <div className="flex max-h-56 flex-col gap-2 overflow-y-auto rounded-md border p-3">
          {projects.map((project) => (
            <label key={project.id} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="projectIds"
                value={project.id}
                className="size-4 shrink-0 accent-primary"
              />
              <span>
                {project.teamName} / {project.name}
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      <Button disabled={pending} className="self-start">
        Create token
      </Button>
    </form>
  );
}
