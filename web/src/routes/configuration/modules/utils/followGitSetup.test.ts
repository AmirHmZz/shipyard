import { afterEach, expect, it, vi } from "vitest";

import type { Start } from "../generics";

import { followGitSetup } from "./followGitSetup";

afterEach(() => vi.unstubAllGlobals());

it("redirects directly when no manifest is present", () => {
  const assign = vi.fn();
  vi.stubGlobal("window", { location: { assign } });
  followGitSetup({
    connectionId: "git",
    url: "https://git.test/authorize",
  } satisfies Start);
  expect(assign).toHaveBeenCalledExactlyOnceWith("https://git.test/authorize");
});

it("submits the original manifest using a hidden POST form", () => {
  const form = { method: "", action: "", append: vi.fn(), submit: vi.fn() };
  const input = { type: "", name: "", value: "" };
  const append = vi.fn();
  vi.stubGlobal("document", {
    createElement: vi.fn().mockReturnValueOnce(form).mockReturnValueOnce(input),
    body: { append },
  });
  const manifest = { name: "Shipyard", url: "https://shipyard.test" };
  followGitSetup({
    connectionId: "git",
    url: "https://git.test/setup",
    manifest,
  } satisfies Start);
  expect(form.method).toBe("POST");
  expect(form.action).toBe("https://git.test/setup");
  expect(input).toEqual({
    type: "hidden",
    name: "manifest",
    value: JSON.stringify(manifest),
  });
  expect(form.append).toHaveBeenCalledExactlyOnceWith(input);
  expect(append).toHaveBeenCalledExactlyOnceWith(form);
  expect(form.submit).toHaveBeenCalledExactlyOnceWith();
});
