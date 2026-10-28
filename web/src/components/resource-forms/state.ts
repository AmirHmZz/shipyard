import type { Resource } from "@/lib/api/types";
import type { ResourceKind } from "@/lib/resource-form-definitions";

import { normalizeApplicationSettings } from "@/lib/application-settings";
import { defaults } from "@/lib/resource-form-definitions";
import { relativeHostname } from "@/lib/route-hostname";

export type ResourceFormInitial = {
  kind: ResourceKind;
  resources: Resource[];
  existing?: Resource;
  parentId?: string;
};
export type ResourceFormState = {
  kind: ResourceKind;
  name: string;
  parent: string;
  project: string;
  team: string;
  data: Record<string, unknown>;
  secrets: Record<string, string>;
  version: number;
  composeYAML: string;
};
export type ResourceFormAction =
  | { type: "name_changed"; value: string }
  | { type: "parent_changed"; value: string }
  | { type: "project_changed"; value: string }
  | { type: "team_changed"; value: string }
  | { type: "data_changed"; value: Record<string, unknown> }
  | { type: "data_field_changed"; key: string; value: unknown }
  | { type: "secret_changed"; key: string; value: string }
  | { type: "compose_changed"; value: string };
export function initialResourceFormState({
  kind,
  resources,
  existing,
  parentId,
}: ResourceFormInitial): ResourceFormState {
  const parent = resources.find(
    (resource) => resource.id === (existing?.parentId || parentId),
  );
  let data = { ...defaults[kind], ...existing?.data };
  if (kind === "application")
    data = {
      ...data,
      ...normalizeApplicationSettings(
        existing?.data || data,
        resources.filter(
          (resource) =>
            resource.kind === "route" && resource.parentId === existing?.id,
        ),
      ),
    };
  if (kind === "route") {
    delete data.path;
    delete data.stripPrefix;
    const zone = resources.find((resource) => resource.id === data.zoneId);
    data.domain = relativeHostname(
      String(data.domain || ""),
      String(zone?.data.domain || ""),
    );
  }
  if (kind === "application" && !existing) data.branch = "";
  let project = "";
  if (parent?.kind === "environment") project = parent.parentId || "";
  if (parent?.kind === "project") project = parent.id;
  return {
    kind,
    name: existing?.name || "",
    parent: existing?.parentId || parentId || "",
    project,
    team: existing?.teamId || "",
    data,
    secrets: {},
    version: existing?.version || 0,
    composeYAML: "",
  };
}
export function resourceFormReducer(
  state: ResourceFormState,
  action: ResourceFormAction,
): ResourceFormState {
  switch (action.type) {
    case "name_changed":
      return { ...state, name: action.value };
    case "parent_changed":
      return {
        ...state,
        parent: action.value,
        data: state.kind === "zone" ? {} : state.data,
      };
    case "project_changed":
      return { ...state, project: action.value, parent: "" };
    case "team_changed":
      return { ...state, team: action.value };
    case "data_changed":
      return { ...state, data: action.value };
    case "secret_changed":
      return {
        ...state,
        secrets: { ...state.secrets, [action.key]: action.value },
      };
    case "compose_changed":
      return { ...state, composeYAML: action.value };
    case "data_field_changed": {
      const { key, value } = action;
      if (
        state.kind === "application" &&
        key === "source" &&
        value === "compose"
      )
        return {
          ...state,
          data: {
            ...state.data,
            source: "compose",
            composeMode: undefined,
            engine: "compose",
            gitId: "",
            repository: "",
            branch: "",
            context: ".",
            file: "compose.yaml",
            autoDeploy: false,
            previews: false,
          },
        };
      const data = { ...state.data, [key]: value };
      if (
        state.kind === "application" &&
        key === "workload" &&
        value === "job"
      ) {
        data.previews = false;
        data.readinessChecks = [];
        data.readinessMode = "container";
      }
      if (
        state.kind === "application" &&
        key === "gitId" &&
        value !== state.data.gitId
      ) {
        data.repository = "";
        data.branch = "";
      }
      if (
        state.kind === "application" &&
        key === "repository" &&
        value !== state.data.repository
      )
        data.branch = "";
      if (key === "engine") {
        data.file = value === "compose" ? "compose.yaml" : "Dockerfile";
        if (value !== "compose") delete data.composeMode;
      }
      return {
        ...state,
        data,
        secrets:
          state.kind === "server" && key === "authMethod" ? {} : state.secrets,
      };
    }
  }
}
