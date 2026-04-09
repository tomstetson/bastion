/**
 * Zustand store for project state.
 * All mutations go through the IPC bridge (window.bastion.projects)
 * and refresh the local list afterward.
 */

import { create } from "zustand";
import type { Project, GridLayout } from "../../electron/core/types";

interface ProjectsState {
  projects: Project[];
  loading: boolean;
  fetchProjects: () => Promise<void>;
  createProject: (name: string, path: string) => Promise<void>;
  renameProject: (id: string, name: string) => Promise<void>;
  deleteProject: (id: string) => Promise<void>;
  setLayout: (id: string, layout: GridLayout) => Promise<void>;
}

export const useProjectsStore = create<ProjectsState>((set, get) => ({
  projects: [],
  loading: false,

  fetchProjects: async () => {
    set({ loading: true });
    try {
      const projects = await window.bastion.projects.list();
      set({ projects, loading: false });
    } catch (err) {
      console.error("Failed to fetch projects:", err);
      set({ loading: false });
    }
  },

  createProject: async (name: string, path: string) => {
    await window.bastion.projects.create(name, path);
    await get().fetchProjects();
  },

  renameProject: async (id: string, name: string) => {
    await window.bastion.projects.rename(id, name);
    await get().fetchProjects();
  },

  deleteProject: async (id: string) => {
    await window.bastion.projects.delete(id);
    await get().fetchProjects();
  },

  setLayout: async (id: string, layout: GridLayout) => {
    await window.bastion.projects.setLayout(id, layout);
    await get().fetchProjects();
  },
}));
