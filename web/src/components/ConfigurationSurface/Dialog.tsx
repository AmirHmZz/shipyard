import type { ComponentProps } from "react";

import { use } from "react";

import * as Modal from "@/components/ui/dialog";
import { ConfigurationPageContext } from "@/lib/configuration-page-context";

export type DialogProps = ComponentProps<typeof Modal.Dialog>;

export function Dialog({ children, ...props }: DialogProps) {
  const page = use(ConfigurationPageContext);
  if (!page) return <Modal.Dialog {...props}>{children}</Modal.Dialog>;
  if (props.open === false) return null;
  return <section>{children}</section>;
}
