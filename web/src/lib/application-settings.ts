import { httpReadinessChecksSchema } from "@/lib/schemas/application";
import { legacyPort } from "@/lib/schemas/coercion";
export type { HTTPReadinessCheck, PreviewRouting } from "@/lib/types";
import type { Resource } from "@/lib/api/types";

function legacyReadiness(data: Record<string, unknown>, routes: Resource[]) {
  const services = new Set(
    routes
      .filter(
        (route) => legacyPort(route.data.targetPort) === legacyPort(data.port),
      )
      .map((route) => String(route.data.service || "app")),
  );
  return data.healthPath && legacyPort(data.port) > 0
    ? [...services].map((service) => ({
        service,
        port: legacyPort(data.port),
        path: String(data.healthPath),
      }))
    : [];
}

export function normalizeApplicationSettings(
  data: Record<string, unknown>,
  routes: Resource[],
  previous?: Record<string, unknown>,
) {
  const result = { ...data };
  if (result.readinessMode == null) result.readinessMode = "checks";
  if (!Array.isArray(result.readinessChecks)) {
    result.readinessChecks = legacyReadiness(data, routes);
  }
  if (result.readinessMode === "container") {
    const checks = httpReadinessChecksSchema.safeParse(result.readinessChecks);
    if (checks.success) result.readinessChecks = checks.data;
    else {
      const saved = httpReadinessChecksSchema.safeParse(
        previous?.readinessChecks ?? legacyReadiness(previous ?? {}, routes),
      );
      result.readinessChecks = saved.success ? saved.data : [];
    }
  }
  if (result.previewRouting == null) {
    result.previewRouting = { mode: "private" };
    if (routes.some((r) => r.data.protocol !== "tcp")) {
      result.previewRouting = { mode: "inherit" };
    } else if (legacyPort(data.port) > 0) {
      result.previewRouting = {
        mode: "target",
        service: "app",
        port: legacyPort(data.port),
      };
    }
  }
  delete result.port;
  delete result.healthPath;
  return result;
}
