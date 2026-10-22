import * as z from "zod/mini";

// Match the locale configured by AppProviders at browser startup.
z.config(z.locales.en());
