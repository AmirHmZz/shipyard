import type { ComponentProps } from "react";

import { use } from "react";

import * as Modal from "@/components/ui/dialog";
import { ConfigurationPageContext } from "@/lib/configuration-page-context";

export type DialogDescriptionProps = ComponentProps<
  typeof Modal.DialogDescription
>;

export function DialogDescription(props: DialogDescriptionProps) {
  return use(ConfigurationPageContext) ? (
    <p {...props} className="text-sm leading-relaxed text-muted-foreground" />
  ) : (
    <Modal.DialogDescription {...props} />
  );
}
