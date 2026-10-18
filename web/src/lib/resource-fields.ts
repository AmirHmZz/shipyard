import type { Resource } from "./api/types";
export function text(data: Resource["data"], key: string, fallback = "") {
  const value = data[key];
  return typeof value === "string" ? value : fallback;
}
export function number(data: Resource["data"], key: string, fallback = 0) {
  const value = data[key];
  return typeof value === "number" ? value : fallback;
}
