import { getCSRF } from "./csrf";
export { getCSRF, setCSRF } from "./csrf";
export class APIError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = "APIError";
  }
}
export async function api<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const response = await fetch(`/api/v1${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      "X-CSRF-Token": getCSRF(),
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
