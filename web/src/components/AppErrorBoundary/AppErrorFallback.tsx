import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export type AppErrorFallbackProps = { compact?: boolean };

export function AppErrorFallback({ compact = false }: AppErrorFallbackProps) {
  function handleButtonClick() {
    return window.location.reload();
  }

  return (
    <div
      className={
        compact
          ? "flex items-center justify-center p-6"
          : "flex min-h-screen items-center justify-center p-6"
      }
    >
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Something went wrong</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Reload the dashboard to try again.
          </p>
          <Button onClick={handleButtonClick}>Reload dashboard</Button>
        </CardContent>
      </Card>
    </div>
  );
}
