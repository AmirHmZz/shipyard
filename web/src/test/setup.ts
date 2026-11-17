import * as z from "zod/mini";

// Match the locale configured by AppProviders at browser startup.
z.config(z.locales.en());

// jsdom has no layout engine; Radix form controls still observe their size.
if (typeof window !== "undefined" && !globalThis.ResizeObserver) {
  globalThis.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}
