import type { ChangeEvent } from "react";

import { Search } from "lucide-react";
import { useState } from "react";

import { Input } from "@/components/ui/input";

import type { McpProject, McpToken } from "../generics";

const writePermissions = [
  ["configure", "Configuration"],
  ["lifecycle", "Lifecycle"],
  ["freshDeploy", "Fresh deploy"],
  ["cleanup", "Cleanup"],
] as const;

export type McpProjectPickerProps = {
  projects: McpProject[];
  projectIds: string[];
  projectPermissions: McpToken["projectPermissions"];
  pending: boolean;
};
export function McpProjectPicker({
  projects,
  projectIds,
  projectPermissions,
  pending,
}: McpProjectPickerProps) {
  const [filter, setFilter] = useState("");
  const [selection, setSelection] = useState(() => new Set(projectIds));
  const [grants, setGrants] = useState(
    () =>
      new Set(
        Object.entries(projectPermissions).flatMap(([id, permissions]) =>
          permissions.map((permission) => `${id}:${permission}`),
        ),
      ),
  );
  const selectedIds = projects.flatMap(({ id }) =>
    selection.has(id) ? [id] : [],
  );
  const search = filter.trim().toLocaleLowerCase();
  const visible = projects.filter((project) =>
    `${project.teamName} / ${project.name}`
      .toLocaleLowerCase()
      .includes(search),
  );

  function searchProjects(event: ChangeEvent<HTMLInputElement>) {
    setFilter(event.currentTarget.value);
  }

  function selectProject(event: ChangeEvent<HTMLInputElement>) {
    const { checked, value } = event.currentTarget;
    setSelection((previous) => {
      const next = new Set(previous);
      if (checked) next.add(value);
      else next.delete(value);
      return next;
    });
  }

  function selectGrant(event: ChangeEvent<HTMLInputElement>) {
    const { checked, value } = event.currentTarget;
    setGrants((previous) => {
      const next = new Set(previous);
      if (checked) next.add(value);
      else next.delete(value);
      return next;
    });
  }

  return (
    <fieldset disabled={pending}>
      <legend className="mb-2 text-sm font-medium">Allowed projects</legend>
      <div className="overflow-hidden rounded-lg border">
        <div className="relative border-b px-2 py-1.5">
          <Search
            className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            type="search"
            aria-label="Search projects"
            placeholder="Search projects"
            value={filter}
            onChange={searchProjects}
            className="border-0 bg-transparent pl-8 shadow-none dark:bg-transparent"
          />
        </div>
        <div className="max-h-52 divide-y overflow-y-auto">
          {visible.length === 0 && (
            <p className="px-3 py-4 text-sm text-muted-foreground">
              {projects.length === 0
                ? "No projects available"
                : "No matching projects"}
            </p>
          )}
          {visible.map((project) => (
            <div key={project.id}>
              <label className="flex cursor-pointer items-center gap-3 px-3 py-2.5 text-sm hover:bg-muted/50">
                <input
                  type="checkbox"
                  value={project.id}
                  checked={selection.has(project.id)}
                  onChange={selectProject}
                  className="size-4 shrink-0 accent-primary"
                />
                <span className="min-w-0 wrap-break-word">
                  {project.teamName && (
                    <span className="text-muted-foreground">
                      {project.teamName} /{" "}
                    </span>
                  )}
                  {project.name}
                </span>
              </label>
              {project.canWrite && selection.has(project.id) && (
                <fieldset className="flex flex-wrap gap-x-4 gap-y-2 px-3 pb-3 pl-10 text-xs">
                  <legend className="mb-1 text-muted-foreground">
                    Application permissions for {project.name}
                  </legend>
                  {writePermissions.map(([permission, label]) => (
                    <label
                      key={permission}
                      className="flex items-center gap-1.5"
                    >
                      <input
                        type="checkbox"
                        value={`${project.id}:${permission}`}
                        checked={grants.has(`${project.id}:${permission}`)}
                        onChange={selectGrant}
                        className="accent-primary"
                      />
                      {label}
                    </label>
                  ))}
                </fieldset>
              )}
            </div>
          ))}
        </div>
        <div
          className="border-t bg-muted/30 px-3 py-2 text-xs text-muted-foreground"
          aria-live="polite"
        >
          {selectedIds.length} selected
        </div>
      </div>
      {selectedIds.map((id) => (
        <input key={id} type="hidden" name="projectIds" value={id} />
      ))}
      {projects
        .filter((project) => project.canWrite && selection.has(project.id))
        .flatMap((project) =>
          writePermissions
            .map(([permission]) => `${project.id}:${permission}`)
            .filter((grant) => grants.has(grant))
            .map((grant) => (
              <input
                key={grant}
                type="hidden"
                name="projectPermission"
                value={grant}
              />
            )),
        )}
    </fieldset>
  );
}
