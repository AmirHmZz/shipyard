export const serverDeletionKeys = {
  status: (id: string) => ["server-deletion", id] as const,
};
