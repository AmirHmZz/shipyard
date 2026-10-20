import { legacyPort } from "@/lib/schemas/coercion";
export type { HTTPReadinessCheck, PreviewRouting } from "@/lib/types";
import type { Resource } from "@/lib/api/types";
export function normalizeApplicationSettings(
  data: Record<string, unknown>,
  routes: Resource[],
) {
  const result = { ...data };
  if (!Array.isArray(result.readinessChecks)) {
    const services = new Set(
      routes
        .filter((r) => legacyPort(r.data.targetPort) === legacyPort(data.port))
        .map((r) => String(r.data.service || "app")),
    );
    result.readinessChecks =
      data.healthPath && legacyPort(data.port) > 0
        ? [...services].map((service) => ({
            service,
            port: legacyPort(data.port),
            path: String(data.healthPath),
          }))
        : [];
  }
  result.previewRouting ??= routes.some((r) => r.data.protocol !== "tcp")
    ? { mode: "inherit" }
    : legacyPort(data.port) > 0
      ? { mode: "target", service: "app", port: legacyPort(data.port) }
      : { mode: "private" };
  delete result.port;
  delete result.healthPath;
  return result;
}
