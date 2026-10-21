import * as z from "zod/mini";

import { requiredText } from "@/lib/schemas/form-rules";

export function authFormSchema(mode: "login" | "setup" | "accept") {
  return z.object({
    email: mode === "accept" ? z.string() : z.email(),
    password: z
      .string()
      .check(z.minLength(mode === "setup" ? 12 : 1, "Enter a password.")),
    name: mode === "login" ? z.string() : requiredText("Full name"),
    code: z.string(),
    token:
      mode === "setup" || mode === "accept"
        ? requiredText("Token")
        : z.string(),
  });
}

// TODO(openapi): document the setup status response.
export const setupStatusResponseSchema = z.object({
  setupRequired: z.boolean(),
  setupEnabled: z.boolean(),
});
