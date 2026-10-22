export type NetworkFormState = {
  server: string;
  mode: string;
  name: string;
  selected: string;
  subnet: string;
  range: string;
  v6: boolean;
  subnet6: string;
};
export type NetworkFormAction =
  | {
      type: "field_changed";
      field: "mode" | "name" | "selected" | "subnet" | "range" | "subnet6";
      value: string;
    }
  | { type: "server_changed"; value: string }
  | { type: "ipv6_changed"; value: boolean };
export function initialNetworkFormState(
  params: URLSearchParams,
): NetworkFormState {
  return {
    server: params.get("server") || "",
    mode: params.has("dockerId") ? "existing" : "create",
    name: params.get("name") || "",
    selected: params.get("dockerId") || "",
    subnet: "",
    range: "",
    v6: false,
    subnet6: "",
  };
}
export function networkFormReducer(
  state: NetworkFormState,
  action: NetworkFormAction,
): NetworkFormState {
  switch (action.type) {
    case "field_changed":
      return { ...state, [action.field]: action.value };
    case "server_changed":
      return { ...state, server: action.value, selected: "" };
    case "ipv6_changed":
      return { ...state, v6: action.value };
  }
}
