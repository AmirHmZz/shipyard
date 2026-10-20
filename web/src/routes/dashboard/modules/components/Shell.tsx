import {
  ChevronDown,
  LogOut,
  Menu,
  Moon,
  Search,
  Settings2,
  Sun,
} from "lucide-react";
import { Suspense, useEffect, useState } from "react";
import {
  Link,
  Outlet,
  useLocation,
  useNavigate,
  useMatches,
} from "react-router";

import type { Session } from "@/lib/api/types";

import { Loading } from "@/components/shared";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { useResources } from "@/lib/hooks/useResources";
import { resolvePageLabel } from "@/lib/route-handle";
import { readTheme, writeTheme } from "@/lib/theme";

import { navigation } from "../generics";
import { useLogout } from "../hooks";
import { Sidebar } from "./Sidebar";
import { WorkspaceSearch } from "./WorkspaceSearch";

export function Shell({ session }: { session: Session }) {
  const logout = useLogout();
  const location = useLocation();
  const navigate = useNavigate();
  const resources = useResources();
  const [search, setSearch] = useState(false);
  const [mobile, setMobile] = useState(false);
  const [dark, setDark] = useState(() => readTheme() === "dark");
  function signOut() {
    if (logout.isPending) return;
    logout.mutate(undefined, {
      onSuccess: () => navigate("/", { replace: true }),
    });
  }
  useEffect(() => {
    writeTheme(dark ? "dark" : "light");
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
  const matches = useMatches();
  const page = section?.label || resolvePageLabel(matches) || "Overview";
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
              <BreadcrumbSeparator className="hidden sm:inline" />
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
                  <BreadcrumbSeparator className="shrink-0" />
                  <BreadcrumbItem className="min-w-0">
                    <BreadcrumbPage className="max-w-24 truncate sm:max-w-40">
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
              <DropdownMenuItem onClick={signOut}>
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
          <Suspense fallback={<Loading />}>
            <Outlet context={session} />
          </Suspense>
        </main>
      </div>
      <WorkspaceSearch open={search} onOpenChange={setSearch} />
    </div>
  );
}
