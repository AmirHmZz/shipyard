import {
  index,
  layout,
  route,
  type RouteConfig,
} from "@react-router/dev/routes";

export default [
  layout("./routes/dashboard.tsx", [
    index("./routes/overview.tsx"),
    route("configure/:kind/:id", "./routes/configuration.tsx"),
    route("networks", "./routes/networks.tsx"),
    route("projects", "./routes/projects.tsx"),
    route("projects/:id", "./routes/project.tsx"),
    route("applications/:id", "./routes/application.tsx"),
    route("deployments", "./routes/deployments.tsx"),
    route("servers", "./routes/servers.tsx"),
    route("servers/:id/delete", "./routes/server-deletion.tsx"),
    route("dns", "./routes/dns.tsx"),
    route("dns/:id", "./routes/dns-zone.tsx"),
    route("dns/:id/records/:record", "./routes/dns-record.tsx"),
    route("integrations", "./routes/integrations.tsx"),
    route("teams", "./routes/teams.tsx"),
    route("settings", "./routes/settings.tsx"),
    route("*", "./routes/not-found.tsx"),
  ]),
] satisfies RouteConfig;
