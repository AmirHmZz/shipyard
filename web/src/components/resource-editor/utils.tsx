import { type ReactNode } from "react";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const choose = (
  value: string,
  onValue: (v: string) => void,
  options: { value: string; label: ReactNode }[],
  placeholder: string,
  disabled = false,
  id?: string,
) => (
  <Select
    value={value || undefined}
    onValueChange={onValue}
    disabled={disabled}
  >
    <SelectTrigger id={id} className="w-full" aria-label={placeholder}>
      <SelectValue placeholder={placeholder} />
    </SelectTrigger>
    <SelectContent>
      {options.map((o) => (
        <SelectItem key={o.value} value={o.value}>
          {o.label}
        </SelectItem>
      ))}
    </SelectContent>
  </Select>
);
