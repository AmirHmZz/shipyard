import {
  ResourceFormProvider,
  type ResourceFormProps,
} from "@/components/resource-forms/controller";
import { type ResourceKind } from "@/components/resource-forms/definitions";
import { ErrorState } from "@/components/shared";

import { ResourceFormView } from "./ResourceFormView";

function TeamForm(props: ResourceFormProps) {
  return (
    <ResourceFormProvider {...props} kind="team">
      <ResourceFormView {...props} kind="team" />
    </ResourceFormProvider>
  );
}

function ProjectForm(props: ResourceFormProps) {
  return (
    <ResourceFormProvider {...props} kind="project">
      <ResourceFormView {...props} kind="project" />
    </ResourceFormProvider>
  );
}

function EnvironmentForm(props: ResourceFormProps) {
  return (
    <ResourceFormProvider {...props} kind="environment">
      <ResourceFormView {...props} kind="environment" />
    </ResourceFormProvider>
  );
}

function ServerForm(props: ResourceFormProps) {
  return (
    <ResourceFormProvider {...props} kind="server">
      <ResourceFormView {...props} kind="server" />
    </ResourceFormProvider>
  );
}

function GitForm(props: ResourceFormProps) {
  return (
    <ResourceFormProvider {...props} kind="git">
      <ResourceFormView {...props} kind="git" />
    </ResourceFormProvider>
  );
}

function DnsForm(props: ResourceFormProps) {
  return (
    <ResourceFormProvider {...props} kind="dns">
      <ResourceFormView {...props} kind="dns" />
    </ResourceFormProvider>
  );
}

function ZoneForm(props: ResourceFormProps) {
  return (
    <ResourceFormProvider {...props} kind="zone">
      <ResourceFormView {...props} kind="zone" />
    </ResourceFormProvider>
  );
}

function ApplicationForm(props: ResourceFormProps) {
  return (
    <ResourceFormProvider {...props} kind="application">
      <ResourceFormView {...props} kind="application" />
    </ResourceFormProvider>
  );
}

function RouteForm(props: ResourceFormProps) {
  return (
    <ResourceFormProvider {...props} kind="route">
      <ResourceFormView {...props} kind="route" />
    </ResourceFormProvider>
  );
}

function WebhookForm(props: ResourceFormProps) {
  return (
    <ResourceFormProvider {...props} kind="webhook">
      <ResourceFormView {...props} kind="webhook" />
    </ResourceFormProvider>
  );
}

const forms = {
  team: TeamForm,
  project: ProjectForm,
  environment: EnvironmentForm,
  server: ServerForm,
  git: GitForm,
  dns: DnsForm,
  zone: ZoneForm,
  application: ApplicationForm,
  route: RouteForm,
  webhook: WebhookForm,
};

export function ResourceForm({
  kind,
  ...props
}: ResourceFormProps & { kind: string }) {
  if (!Object.hasOwn(forms, kind))
    return <ErrorState error={new Error("Unsupported resource kind")} />;
  if (props.existing && props.existing.kind !== kind)
    return (
      <ErrorState
        error={new Error("Resource kind does not match the requested form")}
      />
    );
  const Form = forms[kind as ResourceKind];
  return <Form {...props} />;
}
