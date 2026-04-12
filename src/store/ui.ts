/**
 * Zustand store for UI state.
 * Tracks which project/session is active, sidebar width, view filters,
 * zoom state, and pop-out tracking.
 * No IPC calls — this is purely client-side state.
 */

import { create } from "zustand";
import type { GridLayout } from "../../electron/core/types";

interface UIState {
  activeProjectId: string | null;
  focusedTileSessionId: string | null;
  zoomedSessionId: string | null;
  poppedOutSessionIds: Set<string>;
  statusFilter: string | null;
  sidebarWidth: number;
  /** Grid layout used when no project is active (standalone sessions). */
  standaloneGridLayout: GridLayout;

  setActiveProject: (id: string | null) => void;
  setFocusedTile: (sessionId: string | null) => void;
  toggleZoom: (sessionId: string | null) => void;
  addPopOut: (sessionId: string) => void;
  removePopOut: (sessionId: string) => void;
  isSessionPoppedOut: (sessionId: string) => boolean;
  setStatusFilter: (status: string | null) => void;
  setSidebarWidth: (width: number) => void;
  setStandaloneGridLayout: (layout: GridLayout) => void;
}

export const useUIStore = create<UIState>((set, get) => ({
  activeProjectId: null,
  focusedTileSessionId: null,
  zoomedSessionId: null,
  poppedOutSessionIds: new Set(),
  statusFilter: null,
  sidebarWidth: 220,
  standaloneGridLayout: "auto",

  // Clears zoom when switching projects to prevent stale zoom from another project
  setActiveProject: (id) => set({ activeProjectId: id, zoomedSessionId: null }),

  setFocusedTile: (sessionId) => set({ focusedTileSessionId: sessionId }),

  toggleZoom: (sessionId) => {
    const current = get().zoomedSessionId;
    set({ zoomedSessionId: current === sessionId ? null : sessionId });
  },

  addPopOut: (sessionId) => {
    const next = new Set(get().poppedOutSessionIds);
    next.add(sessionId);
    set({ poppedOutSessionIds: next });
  },

  removePopOut: (sessionId) => {
    const next = new Set(get().poppedOutSessionIds);
    next.delete(sessionId);
    set({ poppedOutSessionIds: next });
  },

  isSessionPoppedOut: (sessionId) => get().poppedOutSessionIds.has(sessionId),

  setStatusFilter: (status) => {
    const current = get().statusFilter;
    // Toggle off if clicking the same filter
    set({ statusFilter: current === status ? null : status });
  },

  setSidebarWidth: (width) => set({ sidebarWidth: width }),

  setStandaloneGridLayout: (layout) => set({ standaloneGridLayout: layout }),
}));
