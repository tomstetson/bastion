/**
 * Zustand store for session state.
 * All mutations go through the IPC bridge (window.bastion.sessions)
 * and refresh the local list afterward.
 */

import { create } from "zustand";
import type {
  Session,
  SessionCreateOptions,
  SessionStatus,
} from "../../electron/core/types";

interface SessionsState {
  sessions: Session[];
  loading: boolean;
  fetchAllSessions: () => Promise<void>;
  createSession: (options: SessionCreateOptions) => Promise<void>;
  stopSession: (id: string) => Promise<void>;
  restartSession: (id: string) => Promise<void>;
  resumeSession: (id: string) => Promise<void>;
  deleteSession: (id: string) => Promise<void>;
  renameSession: (id: string, name: string) => Promise<void>;
  setGridSlot: (id: string, slot: number | null) => Promise<void>;
  getStatusCounts: () => Record<SessionStatus, number>;
}

export const useSessionsStore = create<SessionsState>((set, get) => ({
  sessions: [],
  loading: false,

  fetchAllSessions: async () => {
    set({ loading: true });
    try {
      const sessions = await window.bastion.sessions.listAll();
      set({ sessions, loading: false });
    } catch (err) {
      console.error("Failed to fetch sessions:", err);
      set({ loading: false });
    }
  },

  createSession: async (options: SessionCreateOptions) => {
    await window.bastion.sessions.create(options);
    await get().fetchAllSessions();
  },

  stopSession: async (id: string) => {
    await window.bastion.sessions.stop(id);
    await get().fetchAllSessions();
  },

  restartSession: async (id: string) => {
    await window.bastion.sessions.restart(id);
    await get().fetchAllSessions();
  },

  resumeSession: async (id: string) => {
    await window.bastion.sessions.resume(id);
    await get().fetchAllSessions();
  },

  deleteSession: async (id: string) => {
    await window.bastion.sessions.delete(id);
    await get().fetchAllSessions();
  },

  renameSession: async (id: string, name: string) => {
    await window.bastion.sessions.rename(id, name);
    await get().fetchAllSessions();
  },

  setGridSlot: async (id: string, slot: number | null) => {
    await window.bastion.sessions.setGridSlot(id, slot);
    await get().fetchAllSessions();
  },

  getStatusCounts: () => {
    const { sessions } = get();
    const counts: Record<SessionStatus, number> = {
      running: 0,
      waiting: 0,
      idle: 0,
      error: 0,
      stopped: 0,
    };
    for (const session of sessions) {
      counts[session.status]++;
    }
    return counts;
  },
}));
