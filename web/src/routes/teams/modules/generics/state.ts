export type TeamsState = {
  teamId: string;
  editor: boolean;
  email: string;
  role: string;
  project: string;
  assign: string;
  remove: string;
};

export type TeamsAction =
  | { type: "team_changed"; teamId: string }
  | { type: "editor_changed"; open: boolean }
  | { type: "email_changed"; email: string }
  | { type: "scope_changed"; value: string }
  | { type: "role_changed"; role: string }
  | { type: "assignment_changed"; userId: string }
  | { type: "removal_changed"; userId: string };

export const initialTeamsState: TeamsState = {
  teamId: "",
  editor: false,
  email: "",
  role: "member",
  project: "",
  assign: "",
  remove: "",
};

export function teamsReducer(
  state: TeamsState,
  action: TeamsAction,
): TeamsState {
  switch (action.type) {
    case "team_changed":
      return { ...state, teamId: action.teamId };
    case "editor_changed":
      return { ...state, editor: action.open };
    case "email_changed":
      return { ...state, email: action.email };
    case "scope_changed":
      return {
        ...state,
        project: action.value === "team" ? "" : action.value,
        role: action.value === "team" ? "member" : "viewer",
      };
    case "role_changed":
      return { ...state, role: action.role };
    case "assignment_changed":
      return { ...state, assign: action.userId };
    case "removal_changed":
      return { ...state, remove: action.userId };
  }
}
