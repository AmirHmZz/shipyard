// TODO(openapi): add TeamMembersResponse to api/openapi.yaml.
export type TeamMembersResponse = {
  id: string;
  email: string;
  name: string;
  role: string;
}[];

// TODO(openapi): add InvitationResult to api/openapi.yaml.
export type InvitationResult = { url: string };
