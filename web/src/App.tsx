import { lazy, Suspense, useEffect, useState } from "react";
import {
  Link,
  NavLink,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Activity,
  Anchor,
  ArrowUpRight,
  Box,
  ChevronDown,
  Command,
  GitBranch,
  Globe2,
  HelpCircle,
  Layers3,
  LayoutDashboard,
  LogOut,
  Menu,
  Moon,
  Search,
  Server,
  Settings2,
  Sun,
  Users,
  X,
} from "lucide-react";
import {
  api,
  APIError,
  post,
  setCSRF,
  useResources,
  useDeployments,
  type Session,
} from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Card } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Empty, ErrorState, Loading, PageHeader } from "@/components/shared";
import { Auth } from "@/pages/auth";
import { Overview, DeploymentTable } from "@/pages/overview";
const Configuration = lazy(() =>
  import("@/pages/configuration").then((m) => ({ default: m.Configuration })),
);
const Networks = lazy(() =>
  import("@/pages/networks").then((m) => ({ default: m.Networks })),
);
const Projects = lazy(() =>
  import("@/pages/projects").then((m) => ({ default: m.Projects })),
);
const Application = lazy(() =>
  import("@/pages/application").then((m) => ({ default: m.Application })),
);
const Servers = lazy(() =>
  import("@/pages/infrastructure").then((m) => ({ default: m.Servers })),
);
const Integrations = lazy(() =>
  import("@/pages/infrastructure").then((m) => ({ default: m.Integrations })),
);
const DNS = lazy(() =>
  import("@/pages/infrastructure").then((m) => ({ default: m.DNS })),
);
const Settings = lazy(() =>
  import("@/pages/settings").then((m) => ({ default: m.Settings })),
);
const Teams = lazy(() =>
  import("@/pages/settings").then((m) => ({ default: m.Teams })),
);
const navigation = [
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
function Sidebar({ close }: { close?: () => void }) {
  const q = useResources();
  return (
    <div className="flex h-full flex-col">
      <Link
        to="/"
        onClick={close}
        className="my-6 flex shrink-0 items-center gap-2.5 px-6"
      >
        <div className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <Anchor className="size-5" />
        </div>
        <span className="text-xl font-semibold tracking-tight text-foreground">
          shipyard<span className="text-primary">.</span>
        </span>
        <Badge
          variant="outline"
          className="ml-auto px-1.5 font-mono text-[9px] font-normal text-muted-foreground"
        >
          BETA
        </Badge>
      </Link>
      <div className="px-4">
        <div className="mb-7 flex items-center gap-2.5 rounded-lg border bg-card/70 p-3">
          <div className="flex size-7 items-center justify-center rounded-md bg-muted text-xs font-medium text-primary">
            S
          </div>
          <div>
            <p className="text-xs font-medium text-foreground">
              Deployment workspace
            </p>
            <p className="mt-0.5 text-[10px] text-muted-foreground">
              Self-hosted
            </p>
          </div>
          <ChevronDown className="ml-auto size-3.5 text-muted-foreground" />
        </div>
      </div>
      <nav className="space-y-1 px-3">
        {navigation.map((item, i) => (
          <div key={item.path}>
            {i === 3 && (
              <div className="mt-7 mb-3 px-3 font-mono text-[9px] tracking-[.17em] text-muted-foreground">
                INFRASTRUCTURE
              </div>
            )}
            {i === 7 && <Separator className="my-5" />}
            <NavLink
              to={item.path}
              end={item.path === "/"}
              onClick={close}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-lg px-3 py-2.5 text-[12px] font-medium transition-colors ${isActive ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-accent hover:text-foreground"}`
              }
            >
              <item.icon className="size-4" />
              {item.label}
              {item.label === "Projects" && (
                <span className="ml-auto rounded bg-background/60 px-1.5 py-0.5 font-mono text-[9px]">
                  {q.data?.filter((r) => r.kind === "project").length || 0}
                </span>
              )}
            </NavLink>
          </div>
        ))}
      </nav>
      <div className="mt-auto p-4">
        <div className="flex items-center justify-between px-1 text-[9px] text-muted-foreground">
          <span className="font-mono">SHIPYARD v0.1</span>
          <span className="flex items-center gap-1.5">
            <span className="size-1 rounded-full bg-primary" />
            CONTROL PLANE
          </span>
        </div>
      </div>
    </div>
  );
}
function Deployments() {
  const q = useDeployments();
  const resources = useResources();
  return (
    <>
      <PageHeader
        eyebrow="Workspace"
        title="Deployments"
        description="Every release, its source commit, and its outcome."
      />
      {q.error ? (
        <ErrorState error={q.error} />
      ) : q.isPending ? (
        <Loading />
      ) : q.data?.length ? (
        <Card className="gap-0 overflow-hidden py-0 shadow-none">
          <DeploymentTable
            deployments={q.data}
            resources={resources.data || []}
          />
        </Card>
      ) : (
        <Empty
          title="Your release history starts here"
          description="Deploy an application to see its build progress, health checks, and rollback history."
        />
      )}
    </>
  );
}
function Shell({ session }: { session: Session }) {
  const client = useQueryClient();
  const location = useLocation();
  const navigate = useNavigate();
  const resources = useResources();
  const [search, setSearch] = useState(false);
  const [query, setQuery] = useState("");
  const [mobile, setMobile] = useState(false);
  const [dark, setDark] = useState(
    () => localStorage.getItem("shipyard-theme") === "dark",
  );
  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
    localStorage.setItem("shipyard-theme", dark ? "dark" : "light");
  }, [dark]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        setSearch((v) => !v);
      }
    };
    addEventListener("keydown", key);
    return () => removeEventListener("keydown", key);
  }, []);
  const section = navigation.find(
    (n) => n.path !== "/" && location.pathname.startsWith(n.path),
  );
  const page =
    section?.label ||
    (location.pathname.startsWith("/applications/")
      ? "Applications"
      : "Overview");
  const current = resources.data?.find(
    (r) =>
      r.id === location.pathname.split("/")[2] &&
      ["project", "application", "zone"].includes(r.kind),
  );
  const environment = resources.data?.find((r) => r.id === current?.parentId);
  const project = resources.data?.find((r) => r.id === environment?.parentId);
  const parentLabel =
    current?.kind === "application" ? project?.name || "Projects" : page;
  const parentPath =
    current?.kind === "application"
      ? project
        ? `/projects/${project.id}`
        : "/projects"
      : section?.path || "/";
  return (
    <div className="min-h-screen">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 border-r bg-sidebar lg:block">
        <Sidebar />
      </aside>
      <div className="lg:ml-60">
        <header className="sticky top-0 z-20 flex h-16 items-center gap-4 border-b bg-background/95 px-5 backdrop-blur md:px-9">
          <Sheet open={mobile} onOpenChange={setMobile}>
            <SheetTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Open navigation"
                className="lg:hidden"
              >
                <Menu />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-64 p-0">
              <SheetTitle className="sr-only">Navigation</SheetTitle>
              <Sidebar close={() => setMobile(false)} />
            </SheetContent>
          </Sheet>
          <Breadcrumb aria-label="Workspace navigation" className="min-w-0">
            <BreadcrumbList className="flex-nowrap gap-2 text-xs sm:gap-2">
              <BreadcrumbItem className="hidden sm:inline-flex">
                <BreadcrumbLink asChild>
                  <Link to="/">Workspace</Link>
                </BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator className="hidden sm:inline">
                /
              </BreadcrumbSeparator>
              <BreadcrumbItem className="min-w-0">
                {current ? (
                  <BreadcrumbLink
                    asChild
                    className="max-w-24 truncate sm:max-w-40"
                  >
                    <Link to={parentPath}>{parentLabel}</Link>
                  </BreadcrumbLink>
                ) : (
                  <BreadcrumbPage>{page}</BreadcrumbPage>
                )}
              </BreadcrumbItem>
              {current && (
                <>
                  <BreadcrumbSeparator className="hidden md:inline">
                    /
                  </BreadcrumbSeparator>
                  <BreadcrumbItem className="hidden min-w-0 md:inline-flex">
                    <BreadcrumbPage className="max-w-40 truncate">
                      {current.name}
                    </BreadcrumbPage>
                  </BreadcrumbItem>
                </>
              )}
            </BreadcrumbList>
          </Breadcrumb>
          <Button
            variant="outline"
            className="ml-auto hidden h-8 w-56 justify-start gap-2 bg-card text-xs font-normal text-muted-foreground sm:flex"
            onClick={() => setSearch(true)}
          >
            <Search className="size-3.5" />
            Search your workspace
            <kbd className="ml-auto rounded border px-1 font-mono text-[9px]">
              ⌘ K
            </kbd>
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label={dark ? "Use light theme" : "Use dark theme"}
            className="size-8"
            onClick={() => setDark((v) => !v)}
          >
            {dark ? <Sun className="size-4" /> : <Moon className="size-4" />}
          </Button>
          <Separator orientation="vertical" className="!h-5" />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="h-auto gap-2 p-1.5">
                <Avatar className="size-7">
                  <AvatarFallback className="bg-primary/10 text-[10px] text-primary">
                    {session.user.name
                      .split(" ")
                      .map((s) => s[0])
                      .slice(0, 2)
                      .join("")
                      .toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <span className="hidden text-xs md:block">
                  {session.user.name}
                </span>
                <ChevronDown className="size-3 text-muted-foreground" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel className="text-xs">
                {session.user.email}
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => navigate("/settings")}>
                <Settings2 />
                Account settings
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={async () => {
                  await post("/auth/logout");
                  await client.cancelQueries();
                  client.removeQueries({
                    predicate: (q) => q.queryKey[0] !== "session",
                  });
                  client.setQueryData(["session"], null);
                  setCSRF("");
                  navigate("/", { replace: true });
                }}
              >
                <LogOut />
                Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </header>
        <main className="mx-auto max-w-[1520px] p-5 pb-12 md:p-9">
          {session.maintenance && (
            <Alert className="mb-6">
              <AlertDescription>
                Maintenance mode is enabled. New operations are paused; running
                applications are unaffected.
              </AlertDescription>
            </Alert>
          )}
          <Routes>
            <Route path="/" element={<Overview />} />
            <Route path="/configure/:kind/:id" element={<Configuration />} />
            <Route path="/networks" element={<Networks />} />
            <Route path="/projects" element={<Projects />} />
            <Route path="/projects/:id" element={<Projects />} />

            <Route path="/applications/:id" element={<Application />} />
            <Route path="/deployments" element={<Deployments />} />
            <Route path="/servers" element={<Servers />} />
            <Route path="/dns" element={<DNS />} />
            <Route path="/dns/:id" element={<DNS />} />
            <Route path="/dns/:id/records/:record" element={<DNS />} />
            <Route path="/integrations" element={<Integrations />} />
            <Route path="/teams" element={<Teams />} />
            <Route path="/settings" element={<Settings session={session} />} />
            <Route
              path="*"
              element={
                <Empty
                  title="Page not found"
                  description="Use the navigation to return to your workspace."
                />
              }
            />
          </Routes>
        </main>
      </div>
      <Dialog open={search} onOpenChange={setSearch}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Search workspace</DialogTitle>
            <DialogDescription>
              Find projects, applications, and infrastructure.
            </DialogDescription>
          </DialogHeader>
          <Input
            autoFocus
            placeholder="Search by name…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <div className="max-h-80 space-y-1 overflow-auto">
            {resources.data
              ?.filter((r) =>
                r.name.toLowerCase().includes(query.toLowerCase()),
              )
              .slice(0, 20)
              .map((r) => (
                <Button
                  key={r.id}
                  variant="ghost"
                  className="w-full justify-between"
                  onClick={() => {
                    navigate(
                      r.kind === "application"
                        ? `/applications/${r.id}`
                        : r.kind === "project"
                          ? `/projects/${r.id}`
                          : r.kind === "server"
                            ? "/servers"
                            : r.kind === "zone"
                              ? "/dns"
                              : "/integrations",
                    );
                    setSearch(false);
                  }}
                >
                  <span>{r.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {r.kind}
                  </span>
                </Button>
              ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
export default function App() {
  const session = useQuery({
    queryKey: ["session"],
    queryFn: async () => {
      try {
        const s = await api<Session>("/auth/me");
        setCSRF(s.csrf);
        return s;
      } catch (error) {
        if (error instanceof APIError && error.status === 401) {
          setCSRF("");
          return null;
        }
        throw error;
      }
    },
    retry: false,
    refetchInterval: 60000,
  });
  return (
    <>
      <TooltipProvider>
        {session.isPending ? (
          <div className="p-10">
            <Loading />
          </div>
        ) : session.data ? (
          <Suspense
            fallback={
              <div className="p-10">
                <Loading />
              </div>
            }
          >
            <Shell session={session.data} />
          </Suspense>
        ) : (
          <Auth />
        )}
        <Toaster position="bottom-right" richColors />
      </TooltipProvider>
    </>
  );
}
