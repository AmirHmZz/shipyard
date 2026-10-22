import type { Resource } from "@/lib/api/types";

import { text } from "@/lib/resource-fields";

import type { InstanceDraft } from "./types";

export type GitConnectionState = {
  provider: string;
  name: string;
  owner: string;
  instanceId: string;
  instanceForm: InstanceDraft | null;
};
export type GitConnectionAction =
  | { type: "provider_changed"; value: string }
  | {
      type: "field_changed";
      field: "name" | "owner" | "instanceId";
      value: string;
    }
  | { type: "instance_form_changed"; value: InstanceDraft | null };
export function initialGitConnectionState(
  existing?: Resource,
): GitConnectionState {
  return {
    provider: text(existing?.data || {}, "provider", "github"),
    name: existing?.name || "",
    owner: "",
    instanceId: text(existing?.data || {}, "instanceId"),
    instanceForm: null,
  };
}
export function gitConnectionReducer(
  state: GitConnectionState,
  action: GitConnectionAction,
): GitConnectionState {
  switch (action.type) {
    case "provider_changed":
      return { ...state, provider: action.value, instanceForm: null };
    case "field_changed":
      return { ...state, [action.field]: action.value };
    case "instance_form_changed":
      return { ...state, instanceForm: action.value };
  }
}
