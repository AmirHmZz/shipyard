import type { ComponentProps, ReactNode } from "react";

import { Label } from "@/components/ui/label";

export type FormFieldProps = {
  label: ReactNode;
  labelProps?: Omit<ComponentProps<typeof Label>, "children">;
  className?: string;
  children: ReactNode;
};
export function FormField({
  label,
  labelProps,
  className = "flex flex-col gap-2",
  children,
}: FormFieldProps) {
  return (
    <div className={className}>
      <Label {...labelProps}>{label}</Label>
      {children}
    </div>
  );
}
