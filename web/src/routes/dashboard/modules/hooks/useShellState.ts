import { useEffect, useReducer } from "react";

import { readSidebarCollapsed, writeSidebarCollapsed } from "@/lib/sidebar";
import { readTheme, writeTheme } from "@/lib/theme";

import { shellReducer } from "../generics";

function initialShellState() {
  return {
    search: false,
    mobile: false,
    dark: readTheme() === "dark",
    collapsed: readSidebarCollapsed(),
  };
}
export function useShellState() {
  const [state, dispatch] = useReducer(
    shellReducer,
    undefined,
    initialShellState,
  );
  useEffect(() => {
    writeTheme(state.dark ? "dark" : "light");
  }, [state.dark]);
  useEffect(() => {
    writeSidebarCollapsed(state.collapsed);
  }, [state.collapsed]);
  useEffect(() => {
    function key(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key === "k") {
        event.preventDefault();
        dispatch({ type: "search_toggled" });
      }
    }
    addEventListener("keydown", key);
    return () => removeEventListener("keydown", key);
  }, []);
  function setSearch(value: boolean) {
    dispatch({ type: "search_changed", value });
  }
  function setMobile(value: boolean) {
    dispatch({ type: "mobile_changed", value });
  }
  function toggleTheme() {
    dispatch({ type: "theme_toggled" });
  }
  function toggleSidebar() {
    dispatch({ type: "sidebar_toggled" });
  }
  return {
    state,
    handlers: { setSearch, setMobile, toggleTheme, toggleSidebar },
  };
}
