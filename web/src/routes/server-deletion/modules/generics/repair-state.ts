import type { Resource } from "@/lib/api/types";

import { text } from "@/lib/resource-fields";

export type RepairState = {
  host: string;
  port: string;
  user: string;
  fingerprint: string;
  auth: string;
  credential: string;
};
export type RepairAction =
  | {
      type: "field_changed";
      field: "host" | "port" | "user" | "fingerprint" | "credential";
      value: string;
    }
  | { type: "auth_changed"; value: string }
  | { type: "saved" };
export function initialRepairState(server: Resource): RepairState {
  return {
    host: text(server.data, "host"),
    port: String(server.data.port || 22),
    user: text(server.data, "user"),
    fingerprint: text(server.data, "fingerprint"),
    auth: text(server.data, "authMethod", "private_key"),
    credential: "",
  };
}
export function repairReducer(
  state: RepairState,
  action: RepairAction,
): RepairState {
  switch (action.type) {
    case "field_changed":
      return { ...state, [action.field]: action.value };
    case "auth_changed":
      return { ...state, auth: action.value, credential: "" };
    case "saved":
      return { ...state, credential: "" };
  }
}
