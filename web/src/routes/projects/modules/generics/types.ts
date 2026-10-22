import type { Resource } from "@/lib/api/types";

export type EditorRequest = {
  kind: string;
  existing?: Resource;
  parentId?: string;
};
