import type { ReactNode } from "react";

import { Box } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";

export type EmptyProps = {
  title: string;
  description: string;
  action?: ReactNode;
  icon?: ReactNode;
};

export function Empty({ title, description, action, icon }: EmptyProps) {
  return (
    <Card className="border-dashed bg-card/60 py-0 shadow-none">
      <CardContent className="flex min-h-60 flex-col items-center justify-center p-8 text-center">
        <div className="mb-4 flex size-12 items-center justify-center rounded-xl border bg-background text-muted-foreground">
          {icon || <Box className="size-5" />}
        </div>
        <h3 className="font-medium">{title}</h3>
        <p className="mt-2 mb-5 max-w-md text-sm leading-relaxed text-muted-foreground">
          {description}
        </p>
        {action}
      </CardContent>
    </Card>
  );
}
