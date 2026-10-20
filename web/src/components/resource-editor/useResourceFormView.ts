import type { ChangeEvent, FormEvent } from "react";

import type { ResourceFormProps } from "@/components/resource-forms/controller";
import type { Options } from "@/components/resource-forms/Options";
import type { ResourceKind } from "@/lib/resource-form-definitions";

import { useResourceForm } from "@/components/resource-forms/controller";

import type { ResourceFormViewOptions } from "./types";

function viewState(
  kind: ResourceKind,
  resources: ResourceFormProps["resources"],
  existing: ResourceFormProps["existing"],
  form: ReturnType<typeof useResourceForm>,
  options: Options,
) {
  const { name, parent, data, busy, dnsTesting, dnsVerified, composeYAML } =
    form.state;
  const { parentKind, parentOptions, needsDNSTest, needsComposeDocument } =
    form.derived;
  const registeredZones = new Set(
    resources
      .filter(
        (resource) =>
          resource.kind === "zone" &&
          resource.parentId === parent &&
          resource.id !== existing?.id,
      )
      .map((resource) => resource.data.providerZoneId),
  );
  const selectableZones = (options.availableZones.data || []).filter(
    (zone) => !registeredZones.has(zone.id),
  );
  const projectOptions = resources
    .filter((resource) => resource.kind === "project")
    .map((resource) => ({ value: resource.id, label: resource.name }));
  const teamOptions = resources
    .filter((resource) => resource.kind === "team")
    .map((resource) => ({ value: resource.id, label: resource.name }));
  let kindLabel: string = kind;
  let saveLabel: string = kind;
  if (kind === "git") {
    kindLabel = "Git connection";
    saveLabel = "connection";
  }
  if (kind === "dns") {
    kindLabel = "DNS provider";
    saveLabel = "provider";
  }
  let namePlaceholder = "A descriptive name";
  if (kind === "project") namePlaceholder = "e.g. Customer platform";
  if (kind === "server") namePlaceholder = "e.g. Production · Frankfurt";
  const parentPlaceholder =
    kind === "zone" ? "Select DNS provider" : `Select ${parentKind}`;
  const parentDisabled =
    !!existing ||
    (kind === "zone" && !parentOptions.length) ||
    (kind === "application" && !parentOptions.length);
  const saveDisabled =
    busy ||
    (kind !== "zone" && kind !== "route" && !name) ||
    (needsDNSTest && (!dnsVerified || dnsTesting)) ||
    (kind === "zone" && !data.providerZoneId) ||
    (kind === "zone" && !parent) ||
    (needsComposeDocument && !composeYAML.trim());
  return {
    selectableZones,
    projectOptions,
    teamOptions,
    kindLabel,
    saveLabel,
    namePlaceholder,
    parentPlaceholder,
    parentDisabled,
    saveDisabled,
  };
}
export function useResourceFormView(
  props: ResourceFormViewOptions,
  options: Options,
) {
  const form = useResourceForm();
  const derived = viewState(
    props.kind,
    props.resources,
    props.existing,
    form,
    options,
  );
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    form.handlers.save();
  }
  function changeName(event: ChangeEvent<HTMLInputElement>) {
    form.handlers.setName(event.currentTarget.value);
  }
  function changeCompose(yaml: string) {
    form.handlers.change();
    form.handlers.setComposeYAML(yaml);
  }
  function testProvider() {
    form.handlers.testDNS();
  }
  function close() {
    props.onOpenChange(false);
  }
  return {
    state: form.state,
    derived: { ...form.derived, ...options, ...derived },
    handlers: {
      ...form.handlers,
      submit,
      changeName,
      changeCompose,
      testProvider,
      close,
    },
  };
}
