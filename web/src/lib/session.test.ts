import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter, Outlet, Route, Routes } from "react-router";
import { afterEach, expect, it, vi } from "vitest";

import type { Session } from "./api/types";

import { useAccount, useAdmin, useCurrentSession } from "./session";

afterEach(() => vi.unstubAllGlobals());

function SessionProbe() {
  const session = useCurrentSession();
  const account = useAccount();
  const admin = useAdmin();
  return createElement("span", null, `${session.csrf}:${account.id}:${admin}`);
}

it.each([true, false])(
  "reads dashboard outlet context without requesting the session (admin %s)",
  (admin) => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const session = { csrf: "token", user: { id: "user", admin } } as Session;
    const html = renderToStaticMarkup(
      createElement(
        MemoryRouter,
        null,
        createElement(
          Routes,
          null,
          createElement(
            Route,
            { element: createElement(Outlet, { context: session }) },
            createElement(Route, {
              index: true,
              element: createElement(SessionProbe),
            }),
          ),
        ),
      ),
    );
    expect(html).toContain(`token:user:${admin}`);
    expect(fetch).not.toHaveBeenCalled();
  },
);

it("fails clearly when the dashboard context is missing", () => {
  expect(() => renderToStaticMarkup(createElement(SessionProbe))).toThrow(
    "Session context is missing",
  );
});
