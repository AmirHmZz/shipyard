export type DashboardAccessState = {
  draft: string | null;
  email: string;
  accept: boolean;
};
export type DashboardAccessAction =
  | { type: "domain_changed"; value: string }
  | { type: "email_changed"; value: string }
  | { type: "terms_changed"; value: boolean }
  | { type: "saved" };
export const initialDashboardAccessState: DashboardAccessState = {
  draft: null,
  email: "",
  accept: false,
};
export function dashboardAccessReducer(
  state: DashboardAccessState,
  action: DashboardAccessAction,
): DashboardAccessState {
  switch (action.type) {
    case "domain_changed":
      return { ...state, draft: action.value };
    case "email_changed":
      return { ...state, email: action.value };
    case "terms_changed":
      return { ...state, accept: action.value };
    case "saved":
      return { ...state, draft: null };
  }
}
