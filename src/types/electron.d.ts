/**
 * Type declarations for the window.bastion API exposed by preload.ts.
 *
 * These types let the React renderer call IPC methods with full type checking.
 * The actual implementation lives in electron/preload.ts — these declarations
 * just tell TypeScript what shape window.bastion has.
 */

import type {
  Project,
  Session,
  SessionCreateOptions,
  SessionStatus,
  GridLayout,
} from "../../electron/core/types";

interface BastionAPI {
  projects: {
    list(): Promise<Project[]>;
    create(name: string, path: string): Promise<Project>;
    rename(id: string, name: string): Promise<void>;
    setLayout(id: string, layout: GridLayout): Promise<void>;
    delete(id: string): Promise<void>;
  };
  sessions: {
    create(options: SessionCreateOptions): Promise<Session>;
    get(id: string): Promise<Session | null>;
    listByProject(projectId: string): Promise<Session[]>;
    listStandalone(): Promise<Session[]>;
    listAll(): Promise<Session[]>;
    listByStatus(status: SessionStatus): Promise<Session[]>;
    stop(id: string): Promise<void>;
    restart(id: string): Promise<Session>;
    resume(id: string): Promise<Session | null>;
    delete(id: string): Promise<void>;
    rename(id: string, name: string): Promise<void>;
    setGridSlot(id: string, slot: number | null): Promise<void>;
  };
  pty: {
    subscribe(sessionId: string): Promise<string>;
    write(sessionId: string, data: string): void;
    resize(sessionId: string, cols: number, rows: number): void;
    onData(sessionId: string, callback: (data: string) => void): () => void;
    onExit(sessionId: string, callback: (code: number) => void): () => void;
  };
  popout: {
    create(sessionId: string, sessionName: string): Promise<boolean>;
    close(sessionId: string): Promise<void>;
    exists(sessionId: string): Promise<boolean>;
    onClosed(callback: (sessionId: string) => void): () => void;
  };
  dialog: {
    openFolder(): Promise<string | null>;
  };
}

declare global {
  interface Window {
    bastion: BastionAPI;
  }
}

export {};
