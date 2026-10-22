import type { ComponentProps, ReactNode } from "react";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export type SelectOption =
  | string
  | { value: string; label: ReactNode; disabled?: boolean };
export type SelectControlProps = Pick<
  ComponentProps<typeof Select>,
  "value" | "defaultValue" | "onValueChange" | "disabled" | "name"
> & {
  options: readonly SelectOption[];
  placeholder?: string;
  triggerProps?: Omit<ComponentProps<typeof SelectTrigger>, "children">;
  contentProps?: Omit<ComponentProps<typeof SelectContent>, "children">;
};
export function SelectControl({
  options,
  placeholder,
  triggerProps,
  contentProps,
  ...props
}: SelectControlProps) {
  const items = options.map((option) =>
    typeof option === "string"
      ? { value: option, label: option, disabled: false }
      : option,
  );
  return (
    <Select {...props}>
      <SelectTrigger {...triggerProps}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent {...contentProps}>
        {items.map((item) => (
          <SelectItem
            key={item.value}
            value={item.value}
            disabled={item.disabled}
          >
            {item.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
