import type { components } from "@/lib/schema";
import type { Resource } from "@/lib/api/types";

export type HTTPReadinessCheck = components["schemas"]["HTTPReadinessCheck"];
export type PreviewRouting = components["schemas"]["PreviewRouting"];

export function normalizeApplicationSettings(
  data: Record<string, unknown>,
  routes: Resource[],
) {
  const result = { ...data };
  if (!Array.isArray(result.readinessChecks)) {
    const services = new Set(
      routes
        .filter((r) => Number(r.data.targetPort) === Number(data.port))
        .map((r) => String(r.data.service || "app")),
    );
    result.readinessChecks =
      data.healthPath && Number(data.port) > 0
        ? [...services].map((service) => ({
            service,
            port: Number(data.port),
            path: String(data.healthPath),
          }))
        : [];
  }
  result.previewRouting ??= routes.some((r) => r.data.protocol !== "tcp")
    ? { mode: "inherit" }
    : Number(data.port) > 0
      ? { mode: "target", service: "app", port: Number(data.port) }
      : { mode: "private" };
  delete result.port;
  delete result.healthPath;
  return result;
}
