"use client";

import { useLayoutEffect, useRef, useState } from "react";

/**
 * react-bio-viz components take their size in pixels; this measures a
 * container so they can fill it responsively (the pattern from
 * react-bio-viz's Getting Started guide). Width is 0 until measured, so
 * callers should render nothing until then.
 */
export function useElementWidth<T extends HTMLElement = HTMLDivElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);

  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.floor(entry.contentRect.width)));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return [ref, width] as const;
}
