import type { UIEvent } from "react";

import { useLayoutEffect, useRef, useState } from "react";

import type { LogLine } from "@/lib/log-buffer";

type Anchor = { number: string; offset: number };

export function useLogScroll(lines: LogLine[], endpoint: string) {
  const scroll = useRef<HTMLPreElement>(null);
  const following = useRef(true);
  const anchor = useRef<Anchor | null>(null);
  const identity = useRef(endpoint);
  const [paused, setPaused] = useState(false);

  function captureAnchor(node: HTMLPreElement) {
    const top = node.getBoundingClientRect().top;
    for (const child of node.children) {
      if (!(child instanceof HTMLElement) || !child.dataset.logNumber) continue;
      if (child.getBoundingClientRect().bottom > top) {
        anchor.current = {
          number: child.dataset.logNumber,
          offset: child.getBoundingClientRect().top - top,
        };
        return;
      }
    }
    anchor.current = null;
  }

  function handleScroll(event: UIEvent<HTMLPreElement>) {
    const node = event.currentTarget;
    following.current =
      node.scrollHeight - node.clientHeight - node.scrollTop <= 24;
    setPaused(!following.current);
    if (!following.current) captureAnchor(node);
  }

  function jumpToLatest() {
    following.current = true;
    anchor.current = null;
    setPaused(false);
    const node = scroll.current;
    if (node) node.scrollTop = node.scrollHeight;
  }

  useLayoutEffect(() => {
    const node = scroll.current;
    if (!node) return;
    if (identity.current !== endpoint || lines.length === 0) {
      identity.current = endpoint;
      following.current = true;
      anchor.current = null;
      setPaused(false);
    }
    if (following.current) {
      node.scrollTop = node.scrollHeight;
      return;
    }
    const saved = anchor.current;
    if (saved) {
      const target = node.querySelector<HTMLElement>(
        `[data-log-number="${saved.number}"]`,
      );
      if (target) {
        node.scrollTop +=
          target.getBoundingClientRect().top -
          node.getBoundingClientRect().top -
          saved.offset;
      } else {
        node.scrollTop = 0;
      }
    }
    captureAnchor(node);
  }, [lines, endpoint]);

  return { scroll, paused, handleScroll, jumpToLatest };
}
