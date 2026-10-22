import {
  ChevronDown,
  LogOut,
  Menu,
  Moon,
  Search,
  Settings2,
  Sun,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";
import { Suspense } from "react";
import { Link, Outlet } from "react-router";

import type { Session } from "@/lib/api/types";

import { Loading } from "@/components/Shared";
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
import { cn } from "@/lib/utils";

import { useShellPage } from "../hooks";
import { Sidebar } from "./Sidebar";
import { WorkspaceSearch } from "./WorkspaceSearch";
export type ShellProps = { session: Session };
export function Shell({ session }: ShellProps) {
  const { state, derived, handlers } = useShellPage(session);
  const { search, mobile, dark, collapsed } = state;
  const { current, parentPath, parentLabel, page, initials } = derived;
  const {
    setSearch,
    setMobile,
    toggleTheme,
    signOut,
    closeMobile,
    openSearch,
    openSettings,
    toggleSidebar,
  } = handlers;
  return (
    <div className="min-h-screen">
      <aside
        id="desktop-sidebar"
        className={cn(
          "fixed inset-y-0 left-0 z-30 hidden border-r bg-sidebar lg:block",
          collapsed ? "w-16" : "w-60",
        )}
      >
        <Sidebar collapsed={collapsed} />
      </aside>
      <div className={collapsed ? "lg:ml-16" : "lg:ml-60"}>
        <header className="sticky top-0 z-20 flex h-16 items-center gap-4 border-b bg-background/95 px-5 backdrop-blur md:px-9">
          <Button
            variant="ghost"
            size="icon"
            className="hidden lg:inline-flex"
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            aria-expanded={!collapsed}
            aria-controls="desktop-sidebar"
            onClick={toggleSidebar}
          >
            {collapsed ? <PanelLeftOpen /> : <PanelLeftClose />}
          </Button>
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
              <Sidebar close={closeMobile} />
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
            className="ml-auto hidden h-8 w-56 justify-start bg-card text-xs font-normal text-muted-foreground sm:flex"
            onClick={openSearch}
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
            onClick={toggleTheme}
          >
            {dark ? <Sun /> : <Moon />}
          </Button>
          <Separator orientation="vertical" className="!h-5" />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="h-auto p-1.5">
                <Avatar className="size-7">
                  <AvatarFallback className="bg-primary/10 text-[10px] text-primary">
                    {initials}
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
              <DropdownMenuItem onClick={openSettings}>
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
