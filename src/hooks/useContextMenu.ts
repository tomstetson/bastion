/**
 * Hook for managing context menu state.
 *
 * Returns show/hide functions and the current menu position + items.
 * Use null items as separators between groups.
 */

import { useState, useCallback, useEffect } from "react";

export interface ContextMenuItem {
  label: string;
  action: () => void;
  danger?: boolean;
  disabled?: boolean;
}

interface ContextMenuState {
  visible: boolean;
  x: number;
  y: number;
  items: Array<ContextMenuItem | null>;
}

interface UseContextMenuReturn extends ContextMenuState {
  show: (e: React.MouseEvent, items: Array<ContextMenuItem | null>) => void;
  hide: () => void;
}

export function useContextMenu(): UseContextMenuReturn {
  const [state, setState] = useState<ContextMenuState>({
    visible: false,
    x: 0,
    y: 0,
    items: [],
  });

  const show = useCallback(
    (e: React.MouseEvent, items: Array<ContextMenuItem | null>) => {
      e.preventDefault();
      e.stopPropagation();
      setState({ visible: true, x: e.clientX, y: e.clientY, items });
    },
    [],
  );

  const hide = useCallback(() => {
    setState((prev) => ({ ...prev, visible: false }));
  }, []);

  // Close on any click outside or Escape
  useEffect(() => {
    if (!state.visible) return;

    const handleClick = () => hide();
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") hide();
    };

    // Use setTimeout so the current click event finishes before attaching
    const timer = setTimeout(() => {
      window.addEventListener("click", handleClick);
      window.addEventListener("keydown", handleKey);
    }, 0);

    return () => {
      clearTimeout(timer);
      window.removeEventListener("click", handleClick);
      window.removeEventListener("keydown", handleKey);
    };
  }, [state.visible, hide]);

  return { ...state, show, hide };
}
