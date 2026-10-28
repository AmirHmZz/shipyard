export function usesInlineCompose(data: Record<string, unknown>) {
  return (
    data.source === "compose" ||
    (data.engine === "compose" && data.composeMode === "inline")
  );
}
