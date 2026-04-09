/**
 * Zustand store for UI state.
 * Tracks which project/session is active, sidebar width, and view filters.
 * No IPC calls — this is purely client-side state.
 */

import { create } from "zustand";

interface UIState {
  activeProjectId: string | null;
  focusedTileSessionId: string | null;
  maximizedSessionId: string | null;
  statusFilter: string | null;
  sidebarWidth: number;
  setActiveProject: (id: string | null) => void;
  setFocusedTile: (sessionId: string | null) => void;
  toggleMaximized: (sessionId: string | null) => void;
  setStatusFilter: (status: string | null) => void;
  setSidebarWidth: (width: number) => void;
}

export const useUIStore = create<UIState>((set, get) => ({
  activeProjectId: null,
  focusedTileSessionId: null,
  maximizedSessionId: null,
  statusFilter: null,
  sidebarWidth: 220,

  setActiveProject: (id) => set({ activeProjectId: id }),

  setFocusedTile: (sessionId) => set({ focusedTileSessionId: sessionId }),

  toggleMaximized: (sessionId) => {
    const current = get().maximizedSessionId;
    // If already maximized, un-maximize. Otherwise maximize the given session.
    set({ maximizedSessionId: current === sessionId ? null : sessionId });
  },

  setStatusFilter: (status) => {
    const current = get().statusFilter;
    // Toggle off if clicking the same filter
    set({ statusFilter: current === status ? null : status });
  },

  setSidebarWidth: (width) => set({ sidebarWidth: width }),
}));
