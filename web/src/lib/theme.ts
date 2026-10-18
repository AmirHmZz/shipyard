export type Theme = "light" | "dark";
const THEME_KEY = "shipyard-theme:v1";

export function readTheme(): Theme {
  try {
    const value =
      localStorage.getItem(THEME_KEY) ?? localStorage.getItem("shipyard-theme");
    return value === "dark" ? "dark" : "light";
  } catch {
    return "light";
  }
}

export function writeTheme(theme: Theme) {
  document.documentElement.classList.toggle("dark", theme === "dark");
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {
    // The in-memory preference still works when browser storage is unavailable.
  }
}
