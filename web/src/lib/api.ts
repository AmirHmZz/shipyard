import { useQuery } from "@tanstack/react-query";
import type { components } from "./schema";
export type Resource = components["schemas"]["Resource"];
export type Deployment = components["schemas"]["Deployment"];
export type Session = components["schemas"]["Session"];
export type Metric = components["schemas"]["Metric"];
export type DNSRecord = components["schemas"]["DNSRecord"];
export type CertificateSummary = components["schemas"]["CertificateSummary"];
export function useAccount() {
  return useQuery<Session>({ queryKey: ["session"], enabled: false }).data
    ?.user;
}
let csrf = "";
export class APIError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = "APIError";
  }
}
export function setCSRF(value: string) {
  csrf = value;
}
export function getCSRF() {
  return csrf;
}
export async function api<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const response = await fetch(`/api/v1${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      "X-CSRF-Token": csrf,
      ...options.headers,
    },
    credentials: "same-origin",
  });
  if (!response.ok) {
    const value = await response
      .json()
      .catch(() => ({ error: response.statusText }));
    throw new APIError(response.status, value.error || "Request failed");
  }
  if (
    response.headers.get("Content-Type")?.includes("application/octet-stream")
  )
    return (await response.blob()) as T;
  return response.json() as Promise<T>;
}
export const post = <T = Record<string, unknown>>(
  path: string,
  body: unknown = {},
) => api<T>(path, { method: "POST", body: JSON.stringify(body) });
export function useResources() {
  return useQuery({
    queryKey: ["resources"],
    queryFn: () => api<Resource[]>("/resources"),
    refetchInterval: 15000,
  });
}
export function useDeployments(id?: string) {
  return useQuery({
    queryKey: ["deployments", id],
    queryFn: () =>
      api<Deployment[]>(`/deployments${id ? `?applicationId=${id}` : ""}`),
    refetchInterval: 5000,
  });
}
export function text(data: Resource["data"], key: string, fallback = "") {
  const value = data[key];
  return typeof value === "string" ? value : fallback;
}
export function number(data: Resource["data"], key: string, fallback = 0) {
  const value = data[key];
  return typeof value === "number" ? value : fallback;
}
export function ago(value: string) {
  const seconds = Math.max(0, (Date.now() - new Date(value).getTime()) / 1000);
  if (seconds < 60) return "Just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}
export function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Operation failed";
}
