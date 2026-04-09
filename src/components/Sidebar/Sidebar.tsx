/**
 * Main sidebar component.
 * Composes: header, status filters, project tree, standalone sessions, and footer.
 * Polls sessions every 2 seconds to keep status up to date.
 */

import React, { useEffect, useMemo, useState } from "react";
import { useProjectsStore } from "../../store/projects";
import { useSessionsStore } from "../../store/sessions";
import { useUIStore } from "../../store/ui";
import StatusFilters from "./StatusFilters";
import ProjectTree from "./ProjectTree";
import SessionItem from "./SessionItem";
import ContextMenu from "../ContextMenu";
import RenameDialog from "../Dialogs/RenameDialog";
import { useContextMenu } from "../../hooks/useContextMenu";
import type { ContextMenuItem } from "../../hooks/useContextMenu";
import type { Project, Session } from "../../../electron/core/types";

interface SidebarProps {
  onNewSession: () => void;
}

export default function Sidebar({ onNewSession }: SidebarProps) {
  const projects = useProjectsStore((s) => s.projects);
  const fetchProjects = useProjectsStore((s) => s.fetchProjects);
  const renameProject = useProjectsStore((s) => s.renameProject);
  const deleteProject = useProjectsStore((s) => s.deleteProject);

  const sessions = useSessionsStore((s) => s.sessions);
  const fetchAllSessions = useSessionsStore((s) => s.fetchAllSessions);
  const getStatusCounts = useSessionsStore((s) => s.getStatusCounts);
  const stopSession = useSessionsStore((s) => s.stopSession);
  const restartSession = useSessionsStore((s) => s.restartSession);
  const resumeSession = useSessionsStore((s) => s.resumeSession);
  const deleteSession = useSessionsStore((s) => s.deleteSession);
  const renameSession = useSessionsStore((s) => s.renameSession);

  const activeProjectId = useUIStore((s) => s.activeProjectId);
  const focusedTileSessionId = useUIStore((s) => s.focusedTileSessionId);
  const statusFilter = useUIStore((s) => s.statusFilter);
  const sidebarWidth = useUIStore((s) => s.sidebarWidth);
  const setActiveProject = useUIStore((s) => s.setActiveProject);
  const setFocusedTile = useUIStore((s) => s.setFocusedTile);
  const setStatusFilter = useUIStore((s) => s.setStatusFilter);

  // Rename dialog state
  const [renameTarget, setRenameTarget] = useState<{
    type: "project" | "session";
    id: string;
    name: string;
  } | null>(null);

  // Context menu for standalone sessions
  const standaloneCtx = useContextMenu();

  // Fetch on mount
  useEffect(() => {
    fetchProjects();
    fetchAllSessions();
  }, [fetchProjects, fetchAllSessions]);

  // Poll sessions every 2 seconds
  useEffect(() => {
    const interval = setInterval(fetchAllSessions, 2000);
    return () => clearInterval(interval);
  }, [fetchAllSessions]);

  const statusCounts = getStatusCounts();

  // Filter sessions if a status filter is active
  const filteredSessions = useMemo(() => {
    if (!statusFilter) return sessions;
    return sessions.filter((s) => s.status === statusFilter);
  }, [sessions, statusFilter]);

  // Standalone sessions: those not attached to a project
  const standaloneSessions = useMemo(
    () => filteredSessions.filter((s) => !s.projectId),
    [filteredSessions]
  );

  // Count active sessions (running + waiting)
  const activeCount = useMemo(
    () =>
      sessions.filter((s) => s.status === "running" || s.status === "waiting")
        .length,
    [sessions]
  );

  return (
    <aside
      style={{
        width: sidebarWidth,
        minWidth: sidebarWidth,
        background: "#010409",
        borderRight: "1px solid #21262d",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "16px 12px 12px",
          flexShrink: 0,
        }}
      >
        <h1
          style={{
            fontSize: 13,
            fontWeight: 700,
            letterSpacing: "0.08em",
            color: "#58a6ff",
            margin: 0,
          }}
        >
          BASTION
        </h1>
        <button
          onClick={onNewSession}
          style={{
            fontSize: 11,
            fontWeight: 500,
            padding: "3px 10px",
            borderRadius: 4,
            border: "1px solid #30363d",
            background: "#21262d",
            color: "#c9d1d9",
            cursor: "pointer",
            transition: "background 100ms",
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLButtonElement).style.background = "#30363d";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.background = "#21262d";
          }}
        >
          + New
        </button>
      </div>

      {/* Status filters */}
      <StatusFilters
        counts={statusCounts}
        activeFilter={statusFilter}
        onFilterChange={setStatusFilter}
      />

      {/* Scrollable content */}
      <div
        style={{
          flex: 1,
          overflowY: "auto",
          overflowX: "hidden",
          display: "flex",
          flexDirection: "column",
          gap: 12,
          paddingBottom: 8,
        }}
      >
        {/* Project tree */}
        <div>
          <div
            style={{
              fontSize: 10,
              fontWeight: 600,
              letterSpacing: "0.05em",
              color: "#484f58",
              textTransform: "uppercase",
              padding: "8px 12px 4px",
            }}
          >
            Projects
          </div>
          <ProjectTree
            projects={projects}
            sessions={filteredSessions}
            activeProjectId={activeProjectId}
            focusedSessionId={focusedTileSessionId}
            onSelectProject={setActiveProject}
            onSelectSession={(sessionId) => {
              setFocusedTile(sessionId);
              // Also activate the session's project
              const session = sessions.find((s) => s.id === sessionId);
              if (session?.projectId) {
                setActiveProject(session.projectId);
              }
            }}
            onRenameProject={(p) => setRenameTarget({ type: "project", id: p.id, name: p.name })}
            onDeleteProject={(p) => {
              if (window.confirm(`Delete project "${p.name}"? Sessions will become standalone.`)) {
                deleteProject(p.id);
              }
            }}
            onRenameSession={(s) => setRenameTarget({ type: "session", id: s.id, name: s.name })}
            onStopSession={(s) => {
              if (window.confirm(`Stop session "${s.name}"?`)) stopSession(s.id);
            }}
            onRestartSession={(s) => restartSession(s.id)}
            onResumeSession={(s) => resumeSession(s.id)}
            onDeleteSession={(s) => {
              if (window.confirm(`Delete session "${s.name}"? This cannot be undone.`)) {
                deleteSession(s.id);
              }
            }}
          />
        </div>

        {/* Standalone sessions */}
        {standaloneSessions.length > 0 && (
          <div>
            <div
              style={{
                fontSize: 10,
                fontWeight: 600,
                letterSpacing: "0.05em",
                color: "#484f58",
                textTransform: "uppercase",
                padding: "8px 12px 4px",
              }}
            >
              Standalone
            </div>
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 1,
                paddingLeft: 4,
              }}
            >
              {standaloneSessions.map((session) => (
                <SessionItem
                  key={session.id}
                  session={session}
                  isActive={focusedTileSessionId === session.id}
                  onClick={() => {
                    setFocusedTile(session.id);
                    setActiveProject(null);
                  }}
                  onContextMenu={(e) => {
                    const items: Array<ContextMenuItem | null> = [
                      {
                        label: "Rename",
                        action: () => setRenameTarget({ type: "session", id: session.id, name: session.name }),
                      },
                      null,
                      {
                        label: "Stop",
                        action: () => {
                          if (window.confirm(`Stop session "${session.name}"?`)) stopSession(session.id);
                        },
                        disabled: session.status === "stopped",
                      },
                      {
                        label: "Restart",
                        action: () => restartSession(session.id),
                        disabled: session.status === "stopped",
                      },
                      {
                        label: "Resume",
                        action: () => resumeSession(session.id),
                        disabled: session.status !== "stopped" || !session.resumeData,
                      },
                      null,
                      {
                        label: "Delete",
                        action: () => {
                          if (window.confirm(`Delete session "${session.name}"? This cannot be undone.`)) {
                            deleteSession(session.id);
                          }
                        },
                        danger: true,
                      },
                    ];
                    standaloneCtx.show(e, items);
                  }}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div
        style={{
          padding: "8px 12px",
          borderTop: "1px solid #21262d",
          fontSize: 10,
          color: "#484f58",
          flexShrink: 0,
        }}
      >
        {sessions.length} session{sessions.length !== 1 ? "s" : ""},{" "}
        {activeCount} active
      </div>

      {/* Standalone context menu */}
      {standaloneCtx.visible && (
        <ContextMenu
          x={standaloneCtx.x}
          y={standaloneCtx.y}
          items={standaloneCtx.items}
          onHide={standaloneCtx.hide}
        />
      )}

      {/* Rename dialog */}
      {renameTarget && (
        <RenameDialog
          currentName={renameTarget.name}
          onRename={(newName) => {
            if (renameTarget.type === "project") {
              renameProject(renameTarget.id, newName);
            } else {
              renameSession(renameTarget.id, newName);
            }
          }}
          onClose={() => setRenameTarget(null)}
        />
      )}
    </aside>
  );
}
