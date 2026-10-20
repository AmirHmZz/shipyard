import type { ComponentProps, ReactNode } from "react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export type InputFieldProps = {
  label: ReactNode;
  labelProps?: Omit<ComponentProps<typeof Label>, "children">;
  inputProps: ComponentProps<typeof Input> & {
    [attribute: `data-${string}`]: string | number | boolean | undefined;
  };
  className?: string;
};
export function InputField({
  label,
  labelProps,
  inputProps,
  className = "space-y-2",
}: InputFieldProps) {
  return (
    <div className={className}>
      <Label {...labelProps}>{label}</Label>
      <Input {...inputProps} />
    </div>
  );
}
