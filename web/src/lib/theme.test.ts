import { afterEach, describe, expect, it, vi } from "vitest";

import { readTheme, writeTheme } from "./theme";
afterEach(() => vi.unstubAllGlobals());
describe("optional theme persistence", () => {
  it("preserves a valid legacy preference and prefers the versioned key", () => {
    const getItem = vi.fn((key: string): string | null =>
      key === "shipyard-theme" ? "dark" : null,
    );
    vi.stubGlobal("localStorage", { getItem });
    expect(readTheme()).toBe("dark");
    getItem.mockImplementation((key) =>
      key === "shipyard-theme:v1" ? "light" : "dark",
    );
    expect(readTheme()).toBe("light");
  });
  it("ignores invalid or unavailable stored values", () => {
    vi.stubGlobal("localStorage", { getItem: () => "invalid" });
    expect(readTheme()).toBe("light");
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("disabled");
      },
    });
    expect(readTheme()).toBe("light");
  });
  it("applies a theme even when persistence fails", () => {
    const toggle = vi.fn();
    vi.stubGlobal("document", { documentElement: { classList: { toggle } } });
    vi.stubGlobal("localStorage", {
      setItem: () => {
        throw new Error("quota");
      },
    });
    expect(() => writeTheme("dark")).not.toThrow();
    expect(toggle).toHaveBeenCalledWith("dark", true);
  });
});
