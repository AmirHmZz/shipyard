import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createMemoryRouter, Outlet, RouterProvider } from "react-router";
import { expect, it } from "vitest";

import { ContentErrorBoundary } from "./content-error-boundary";

it("keeps the shell and renders the compact fallback for a page error", () => {
  const router = createMemoryRouter(
    [
      {
        path: "/",
        element: createElement(
          "div",
          null,
          createElement("aside", null, "Sidebar"),
          createElement("header", null, "Header"),
          createElement("main", null, createElement(Outlet)),
        ),
        children: [
          {
            id: "page",
            index: true,
            element: createElement("p", null, "Page"),
            ErrorBoundary: ContentErrorBoundary,
          },
        ],
      },
    ],
    { hydrationData: { errors: { page: "synthetic page failure" } } },
  );
  const html = renderToStaticMarkup(createElement(RouterProvider, { router }));
  expect(html).toContain("<aside>Sidebar</aside>");
  expect(html).toContain("<header>Header</header>");
  expect(html).toContain("Something went wrong");
  expect(html).toContain("Reload dashboard");
  expect(html).not.toContain("min-h-screen");
  router.dispose();
});
