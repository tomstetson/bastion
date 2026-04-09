/**
 * Positioned absolute context menu rendered at (x, y).
 *
 * - Normal items: white text on dark background
 * - Danger items: red text
 * - Disabled items: gray text, no pointer events
 * - Null items render as separators
 * - Clicking an item triggers its action and hides the menu
 */

import React from "react";
import type { ContextMenuItem } from "../hooks/useContextMenu";

interface ContextMenuProps {
  x: number;
  y: number;
  items: Array<ContextMenuItem | null>;
  onHide: () => void;
}

export default function ContextMenu({ x, y, items, onHide }: ContextMenuProps) {
  return (
    <div
      style={{
        position: "fixed",
        left: x,
        top: y,
        zIndex: 200,
        background: "#161b22",
        border: "1px solid #30363d",
        borderRadius: 6,
        padding: "4px 0",
        minWidth: 160,
        boxShadow: "0 4px 16px rgba(0,0,0,0.4)",
      }}
      onClick={(e) => e.stopPropagation()}
    >
      {items.map((item, idx) => {
        // Null items are separators
        if (item === null) {
          return (
            <div
              key={`sep-${idx}`}
              style={{
                height: 1,
                background: "#30363d",
                margin: "4px 0",
              }}
            />
          );
        }

        return (
          <div
            key={`${item.label}-${idx}`}
            onClick={() => {
              if (!item.disabled) {
                item.action();
                onHide();
              }
            }}
            style={{
              padding: "6px 14px",
              fontSize: 12,
              color: item.disabled
                ? "#484f58"
                : item.danger
                  ? "#f85149"
                  : "#c9d1d9",
              cursor: item.disabled ? "default" : "pointer",
              pointerEvents: item.disabled ? "none" : "auto",
              background: "transparent",
              transition: "background 80ms",
            }}
            onMouseEnter={(e) => {
              if (!item.disabled) {
                (e.currentTarget as HTMLDivElement).style.background = "#1c2128";
              }
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLDivElement).style.background = "transparent";
            }}
          >
            {item.label}
          </div>
        );
      })}
    </div>
  );
}
