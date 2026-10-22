import { ProjectsMainView } from "../modules/components";

export default function ProjectsRoute() {
  return <ProjectsMainView />;
}

export function meta() {
  return [{ title: "Projects — Shipyard" }];
}
export { ContentErrorBoundary as ErrorBoundary } from "@/components/content-error-boundary";
