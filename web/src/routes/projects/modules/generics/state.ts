import type { Resource } from "@/lib/api/types";

import type { EditorRequest } from "./types";

export type ProjectsState = {
  deleting: Resource | null;
  filter: string;
  editor: EditorRequest | null;
};
export type ProjectsAction =
  | { type: "deletion_changed"; resource: Resource | null }
  | { type: "filter_changed"; value: string }
  | { type: "editor_changed"; request: EditorRequest | null };
export const initialProjectsState: ProjectsState = {
  deleting: null,
  filter: "",
  editor: null,
};
export function projectsReducer(
  state: ProjectsState,
  action: ProjectsAction,
): ProjectsState {
  switch (action.type) {
    case "deletion_changed":
      return { ...state, deleting: action.resource };
    case "filter_changed":
      return { ...state, filter: action.value };
    case "editor_changed":
      return { ...state, editor: action.request };
  }
}
