/**
 * Global keyboard shortcut handler.
 *
 * Listens for Cmd+key combinations and dispatches actions:
 * - Cmd+N → open new session dialog
 * - Cmd+W → stop focused session (with confirmation)
 * - Cmd+Enter → zoom/restore focused tile
 * - Cmd+1-6 → focus tile by grid slot position
 * - Cmd+K → toggle command palette
 * - Cmd+[ → previous project in sidebar
 * - Cmd+] → next project in sidebar
 * - Escape → restore zoomed / close dialog
 */

import { useEffect } from "react";
import { useUIStore } from "../store/ui";
import { useSessionsStore } from "../store/sessions";
import { useProjectsStore } from "../store/projects";

interface UseKeyboardOptions {
  onNewSession: () => void;
  onToggleCommandPalette: () => void;
  /** Called when Escape is pressed and no other action consumed it */
  onEscape?: () => void;
}

export function useKeyboard({
  onNewSession,
  onToggleCommandPalette,
  onEscape,
}: UseKeyboardOptions): void {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const isMeta = e.metaKey || e.ctrlKey;

      // --- Escape (no modifier required) ---
      if (e.key === "Escape") {
        const zoomedId = useUIStore.getState().zoomedSessionId;
        if (zoomedId) {
          e.preventDefault();
          useUIStore.getState().toggleZoom(null);
          return;
        }
        onEscape?.();
        return;
      }

      if (!isMeta) return;

      // --- Cmd+N: new session ---
      if (e.key === "n") {
        e.preventDefault();
        onNewSession();
        return;
      }

      // --- Cmd+W: stop focused session ---
      if (e.key === "w") {
        e.preventDefault();
        const focusedId = useUIStore.getState().focusedTileSessionId;
        if (focusedId) {
          const session = useSessionsStore.getState().sessions.find((s) => s.id === focusedId);
          if (session && session.status !== "stopped") {
            if (window.confirm(`Stop session "${session.name}"?`)) {
              useSessionsStore.getState().stopSession(focusedId);
            }
          }
        }
        return;
      }

      // --- Cmd+Enter: zoom/restore ---
      if (e.key === "Enter") {
        e.preventDefault();
        const focusedId = useUIStore.getState().focusedTileSessionId;
        if (focusedId) {
          useUIStore.getState().toggleZoom(focusedId);
        }
        return;
      }

      // --- Cmd+K: toggle command palette ---
      if (e.key === "k") {
        e.preventDefault();
        onToggleCommandPalette();
        return;
      }

      // --- Cmd+1-6: focus tile by grid slot ---
      const slotNum = parseInt(e.key, 10);
      if (slotNum >= 1 && slotNum <= 6) {
        e.preventDefault();
        const sessions = useSessionsStore.getState().sessions;
        const target = sessions.find((s) => s.gridSlot === slotNum - 1);
        if (target) {
          useUIStore.getState().setFocusedTile(target.id);
        }
        return;
      }

      // --- Cmd+[ / Cmd+]: cycle sessions (when zoomed) or navigate projects ---
      if (e.key === "[" || e.key === "]") {
        e.preventDefault();

        // If zoomed, cycle through sessions instead of projects
        const zoomedId = useUIStore.getState().zoomedSessionId;
        if (zoomedId) {
          const allSessions = useSessionsStore.getState().sessions;
          if (allSessions.length <= 1) return;
          const currentIdx = allSessions.findIndex((s) => s.id === zoomedId);
          if (currentIdx === -1) return;
          const nextIdx =
            e.key === "]"
              ? (currentIdx + 1) % allSessions.length
              : (currentIdx - 1 + allSessions.length) % allSessions.length;
          useUIStore.getState().toggleZoom(allSessions[nextIdx].id);
          return;
        }

        const projects = useProjectsStore.getState().projects;
        if (projects.length === 0) return;

        const sorted = [...projects].sort((a, b) => a.sortOrder - b.sortOrder);
        const activeId = useUIStore.getState().activeProjectId;
        const currentIndex = sorted.findIndex((p) => p.id === activeId);

        let nextIndex: number;
        if (e.key === "[") {
          // Previous project
          nextIndex = currentIndex <= 0 ? sorted.length - 1 : currentIndex - 1;
        } else {
          // Next project
          nextIndex = currentIndex >= sorted.length - 1 ? 0 : currentIndex + 1;
        }

        useUIStore.getState().setActiveProject(sorted[nextIndex].id);
        return;
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onNewSession, onToggleCommandPalette, onEscape]);
}
