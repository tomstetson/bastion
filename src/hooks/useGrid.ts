/**
 * Responsive grid calculator hook.
 *
 * Auto mode picks layout based on container width:
 *   <600px  → 1x1
 *   600-1100px → 2x1
 *   1100-1600px → 2x2
 *   >1600px → 3x2
 *
 * Manual mode ("NxM") is used directly.
 */

import { useState, useEffect, useRef, useCallback } from "react";
import type { GridLayout } from "../../electron/core/types";

interface GridDimensions {
  cols: number;
  rows: number;
  layout: GridLayout;
}

function calcAutoLayout(width: number): { cols: number; rows: number } {
  if (width < 600) return { cols: 1, rows: 1 };
  if (width < 1100) return { cols: 2, rows: 1 };
  if (width < 1600) return { cols: 2, rows: 2 };
  return { cols: 3, rows: 2 };
}

function parseLayout(layout: GridLayout): { cols: number; rows: number } | null {
  if (layout === "auto") return null;
  const match = layout.match(/^(\d+)x(\d+)$/);
  if (!match) return null;
  return { cols: parseInt(match[1], 10), rows: parseInt(match[2], 10) };
}

export function useGrid(layout: GridLayout): GridDimensions & {
  containerRef: React.RefObject<HTMLDivElement | null>;
} {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dims, setDims] = useState<{ cols: number; rows: number }>({ cols: 2, rows: 2 });

  const updateDims = useCallback(() => {
    const manual = parseLayout(layout);
    if (manual) {
      setDims(manual);
      return;
    }
    // Auto mode: use container width
    const container = containerRef.current;
    if (container) {
      setDims(calcAutoLayout(container.clientWidth));
    }
  }, [layout]);

  useEffect(() => {
    updateDims();

    if (layout !== "auto") return;

    const container = containerRef.current;
    if (!container) return;

    const observer = new ResizeObserver(() => {
      requestAnimationFrame(updateDims);
    });
    observer.observe(container);

    return () => observer.disconnect();
  }, [layout, updateDims]);

  return {
    cols: dims.cols,
    rows: dims.rows,
    layout,
    containerRef,
  };
}
