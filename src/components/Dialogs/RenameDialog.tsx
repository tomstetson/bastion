/**
 * Simple modal dialog for renaming a session or project.
 * Pre-fills with the current name, Enter confirms, Escape cancels.
 * Focuses the input on mount with text selected.
 */

import React, { useState, useRef, useEffect } from "react";

interface RenameDialogProps {
  currentName: string;
  onRename: (name: string) => void;
  onClose: () => void;
}

export default function RenameDialog({
  currentName,
  onRename,
  onClose,
}: RenameDialogProps) {
  const [name, setName] = useState(currentName);
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus and select text on mount
  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  const handleConfirm = () => {
    const trimmed = name.trim();
    if (trimmed && trimmed !== currentName) {
      onRename(trimmed);
    }
    onClose();
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.6)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 110,
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "#161b22",
          border: "1px solid #30363d",
          borderRadius: 8,
          padding: 20,
          minWidth: 320,
          color: "#c9d1d9",
          fontSize: 14,
        }}
      >
        <h3 style={{ margin: "0 0 12px", fontSize: 15, fontWeight: 600 }}>
          Rename
        </h3>
        <input
          ref={inputRef}
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleConfirm();
          }}
          style={{
            width: "100%",
            padding: "6px 10px",
            borderRadius: 4,
            border: "1px solid #30363d",
            background: "#0d1117",
            color: "#c9d1d9",
            fontSize: 13,
            outline: "none",
            boxSizing: "border-box",
          }}
        />
        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            gap: 8,
            marginTop: 16,
          }}
        >
          <button
            onClick={onClose}
            style={{
              padding: "6px 16px",
              borderRadius: 4,
              border: "1px solid #30363d",
              background: "#21262d",
              color: "#c9d1d9",
              cursor: "pointer",
              fontSize: 13,
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            style={{
              padding: "6px 16px",
              borderRadius: 4,
              border: "1px solid #58a6ff",
              background: "#58a6ff22",
              color: "#58a6ff",
              cursor: "pointer",
              fontSize: 13,
              fontWeight: 600,
            }}
          >
            Rename
          </button>
        </div>
      </div>
    </div>
  );
}
