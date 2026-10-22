import type { RouteConfig } from "@react-router/dev/routes";

import { index, layout, route } from "@react-router/dev/routes";

export default [
  layout("./routes/dashboard/layout.tsx", [
    index("./routes/overview/route.tsx"),
    route("configure/:kind/:id", "./routes/configuration/route.tsx"),
    route("networks", "./routes/networks/route.tsx"),
    route("projects", "./routes/projects/list/route.tsx"),
    route("projects/:id", "./routes/projects/detail/route.tsx"),
    route("applications/:id", "./routes/application/route.tsx"),
    route("deployments", "./routes/deployments/route.tsx"),
    route("servers", "./routes/servers/route.tsx"),
    route("servers/:id/delete", "./routes/server-deletion/route.tsx"),
    route("dns", "./routes/dns/list/route.tsx"),
    route("dns/:id", "./routes/dns/zone/route.tsx"),
    route("dns/:id/records/:record", "./routes/dns/record/route.tsx"),
    route("integrations", "./routes/integrations/route.tsx"),
    route("teams", "./routes/teams/route.tsx"),
    route("settings", "./routes/settings/route.tsx"),
    route("*", "./routes/not-found/route.tsx"),
  ]),
] satisfies RouteConfig;
