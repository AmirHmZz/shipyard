import type * as React from "react";

import { Search } from "lucide-react";

import { Input } from "@/components/ui/input";

export type FilterProps = {
  value: string;
  onChange: (s: string) => void;
  placeholder?: string;
};

export function Filter({
  value,
  onChange,
  placeholder = "Filter by name…",
}: FilterProps) {
  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    return onChange(e.target.value);
  }

  return (
    <div className="relative max-w-xs">
      <Search className="absolute top-3 left-3 size-4 text-muted-foreground" />
      <Input
        className="h-10 bg-card pl-9"
        value={value}
        onChange={handleInputChange}
        placeholder={placeholder}
      />
    </div>
  );
}
