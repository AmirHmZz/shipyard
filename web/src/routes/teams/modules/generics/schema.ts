import * as z from "zod/mini";

import { ASSIGNMENT_ROLES } from "@/lib/enums";
import { INVITATION_ROLES } from "@/lib/enums";

export const invitationFormSchema = z
  .object({
    email: z.email(),
    role: z.enum(INVITATION_ROLES),
    projectId: z.string(),
  })
  .check(
    z.check((context) => {
      const value = context.value;
      if (value.projectId && value.role === "member")
        context.issues.push({
          code: "custom",
          path: ["role"],
          message: "Select a project role.",
          input: context.value,
        });
    }),
  );

export const teamMembersResponseSchema = z.array(
  z.object({
    id: z.string(),
    email: z.string(),
    name: z.string(),
    role: z.string(),
  }),
);

// TODO(openapi): document the invitation creation response.
export const invitationResultResponseSchema = z.object({ url: z.string() });

export const projectAssignmentSchema = z.object({
  userId: z.string().check(z.minLength(1)),
  role: z.enum(ASSIGNMENT_ROLES),
});
