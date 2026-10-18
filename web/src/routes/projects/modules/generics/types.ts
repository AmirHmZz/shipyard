import { type Resource } from "@/lib/api";

export type EditorRequest = {
  kind: string;
  existing?: Resource;
  parentId?: string;
};
