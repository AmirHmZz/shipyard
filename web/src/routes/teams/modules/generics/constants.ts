export const teamKeys = {
  members: (teamId?: string) => ["members", teamId] as const,
  membersPrefix: ["members"] as const,
  memberRemoval: ["remove-member"] as const,
};
