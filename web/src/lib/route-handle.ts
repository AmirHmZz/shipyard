import type { Params } from "react-router";
export type RouteHandle = { pageLabel?: string | ((params: Params) => string) };
export function resolvePageLabel(
  matches: readonly { handle?: unknown; params: Params }[],
): string | undefined {
  const leaf = matches.at(-1);
  const label = (leaf?.handle as RouteHandle | undefined)?.pageLabel;
  return typeof label === "function" ? label(leaf!.params) : label;
}
