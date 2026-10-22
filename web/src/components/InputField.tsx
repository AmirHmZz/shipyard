import type { ComponentProps, ReactNode } from "react";

import type { FormFieldProps } from "@/components/FormField";

import { FormField } from "@/components/FormField";
import { Input } from "@/components/ui/input";

export type InputFieldProps = {
  label: ReactNode;
  labelProps?: FormFieldProps["labelProps"];
  inputProps: ComponentProps<typeof Input> & {
    [attribute: `data-${string}`]: string | number | boolean | undefined;
  };
  className?: string;
};
export function InputField({
  label,
  labelProps,
  inputProps,
  className,
}: InputFieldProps) {
  return (
    <FormField label={label} labelProps={labelProps} className={className}>
      <Input {...inputProps} />
    </FormField>
  );
}
