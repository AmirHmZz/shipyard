import { useLocation, useNavigate, useMatches } from "react-router";

import type { Session } from "@/lib/api/types";

import { useResources } from "@/lib/hooks/useResources";
import { resolvePageLabel } from "@/lib/route-handle";

import { navigation } from "../generics";
import { useLogout } from "./useLogout";
import { useShellState } from "./useShellState";
export function useShellPage(session: Session) {
  const logout = useLogout();
  const location = useLocation();
  const navigate = useNavigate();
  const resources = useResources();
  const { state, handlers } = useShellState();
  const { search, mobile, dark } = state;
  const { setSearch, setMobile, toggleTheme } = handlers;
  function signOut() {
    if (logout.isPending) return;
    logout.mutate(undefined, {
      onSuccess: () => navigate("/", { replace: true }),
    });
  }
  const section = navigation.find(
    (n) => n.path !== "/" && location.pathname.startsWith(n.path),
  );
  const matches = useMatches();
  const page = section?.label || resolvePageLabel(matches) || "Overview";
  const current = resources.data?.find(
    (r) =>
      r.id === location.pathname.split("/")[2] &&
      ["project", "application", "zone"].includes(r.kind),
  );
  const environment = resources.data?.find((r) => r.id === current?.parentId);
  const project = resources.data?.find((r) => r.id === environment?.parentId);
  const parentLabel =
    current?.kind === "application" ? project?.name || "Projects" : page;
  let parentPath = section?.path || "/";
  if (current?.kind === "application")
    parentPath = project ? "/projects/" + project.id : "/projects";

  const initials = session.user.name
    .split(" ")
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  function closeMobile() {
    setMobile(false);
  }
  function openSearch() {
    setSearch(true);
  }
  function openSettings() {
    navigate("/settings");
  }
  return {
    state: { search, mobile, dark },
    derived: { current, parentPath, parentLabel, page, initials },
    handlers: {
      setSearch,
      setMobile,
      toggleTheme,
      signOut,
      closeMobile,
      openSearch,
      openSettings,
    },
  };
}
