import {
  Activity,
  Box,
  GitBranch,
  Globe2,
  Layers3,
  LayoutDashboard,
  Server,
  Settings2,
  Users,
} from "lucide-react";

export const navigation = [
  { label: "Overview", path: "/", icon: LayoutDashboard },
  { label: "Projects", path: "/projects", icon: Layers3 },
  { label: "Deployments", path: "/deployments", icon: GitBranch },

  { label: "Servers", path: "/servers", icon: Server },
  { label: "Networks", path: "/networks", icon: Box },
  { label: "DNS & domains", path: "/dns", icon: Globe2 },
  { label: "Integrations", path: "/integrations", icon: Activity },
  { label: "Teams & access", path: "/teams", icon: Users },
  { label: "Settings", path: "/settings", icon: Settings2 },
];
