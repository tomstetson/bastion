/**
 * Collapsible project list in the sidebar.
 *
 * Each project shows:
 * - Expand/collapse chevron
 * - Name + session count
 * - When collapsed: inline status dots
 * - When expanded: SessionItems, with overflow "+ N more" indicator
 *
 * Active project gets a blue left border and shows its path.
 */

import React, { useState, useMemo } from "react";
import type { Project, Session, SessionStatus } from "../../../electron/core/types";
import SessionItem from "./SessionItem";
import ContextMenu from "../ContextMenu";
import { useContextMenu } from "../../hooks/useContextMenu";
import type { ContextMenuItem } from "../../hooks/useContextMenu";

const STATUS_COLORS: Record<SessionStatus, string> = {
  running: "#3fb950",
  waiting: "#d29922",
  idle: "#8b949e",
  error: "#f85149",
  stopped: "#484f58",
};

/** Max sessions to show expanded before "+ N more" */
const MAX_VISIBLE_SESSIONS = 6;

interface ProjectTreeProps {
  projects: Project[];
  sessions: Session[];
  activeProjectId: string | null;
  focusedSessionId: string | null;
  onSelectProject: (projectId: string) => void;
  onSelectSession: (sessionId: string) => void;
  onRenameProject?: (project: Project) => void;
  onDeleteProject?: (project: Project) => void;
  onRenameSession?: (session: Session) => void;
  onStopSession?: (session: Session) => void;
  onRestartSession?: (session: Session) => void;
  onResumeSession?: (session: Session) => void;
  onDeleteSession?: (session: Session) => void;
}

export default function ProjectTree({
  projects,
  sessions,
  activeProjectId,
  focusedSessionId,
  onSelectProject,
  onSelectSession,
  onRenameProject,
  onDeleteProject,
  onRenameSession,
  onStopSession,
  onRestartSession,
  onResumeSession,
  onDeleteSession,
}: ProjectTreeProps) {
  // Context menu state
  const ctxMenu = useContextMenu();

  // Track which projects are expanded; active project is always expanded
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const sessionsByProject = useMemo(() => {
    const map: Record<string, Session[]> = {};
    for (const s of sessions) {
      if (s.projectId) {
        if (!map[s.projectId]) map[s.projectId] = [];
        map[s.projectId].push(s);
      }
    }
    return map;
  }, [sessions]);

  const toggleExpand = (projectId: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(projectId)) {
        next.delete(projectId);
      } else {
        next.add(projectId);
      }
      return next;
    });
  };

  if (projects.length === 0) {
    return (
      <div style={{ padding: "8px 12px" }}>
        <span style={{ fontSize: 11, color: "#484f58" }}>No projects</span>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      {/* Context menu */}
      {ctxMenu.visible && (
        <ContextMenu
          x={ctxMenu.x}
          y={ctxMenu.y}
          items={ctxMenu.items}
          onHide={ctxMenu.hide}
        />
      )}

      {projects.map((project) => {
        const isActive = activeProjectId === project.id;
        const isExpanded = isActive || expanded.has(project.id);
        const projectSessions = sessionsByProject[project.id] || [];
        const visibleSessions = projectSessions.slice(0, MAX_VISIBLE_SESSIONS);
        const overflow = projectSessions.length - MAX_VISIBLE_SESSIONS;

        return (
          <div key={project.id}>
            {/* Project header */}
            <div
              onClick={() => {
                onSelectProject(project.id);
                if (!isExpanded) toggleExpand(project.id);
              }}
              onContextMenu={(e) => {
                const items: Array<ContextMenuItem | null> = [
                  {
                    label: "Rename",
                    action: () => onRenameProject?.(project),
                  },
                  null,
                  {
                    label: "Delete Project",
                    action: () => onDeleteProject?.(project),
                    danger: true,
                  },
                ];
                ctxMenu.show(e, items);
              }}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                padding: "6px 8px 6px 8px",
                borderLeft: isActive
                  ? "2px solid #58a6ff"
                  : "2px solid transparent",
                cursor: "pointer",
                background: isActive ? "#1c2128" : "transparent",
                borderRadius: "0 4px 4px 0",
                transition: "background 100ms",
              }}
              onMouseEnter={(e) => {
                if (!isActive)
                  (e.currentTarget as HTMLDivElement).style.background =
                    "#161b22";
              }}
              onMouseLeave={(e) => {
                if (!isActive)
                  (e.currentTarget as HTMLDivElement).style.background =
                    "transparent";
              }}
            >
              {/* Chevron */}
              <span
                onClick={(e) => {
                  e.stopPropagation();
                  toggleExpand(project.id);
                }}
                style={{
                  fontSize: 10,
                  color: "#484f58",
                  cursor: "pointer",
                  transform: isExpanded ? "rotate(90deg)" : "rotate(0deg)",
                  transition: "transform 150ms",
                  flexShrink: 0,
                  width: 12,
                  textAlign: "center",
                }}
              >
                ▶
              </span>

              {/* Project name */}
              <span
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  color: isActive ? "#c9d1d9" : "#8b949e",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  flex: 1,
                }}
              >
                {project.name}
              </span>

              {/* Status dots (collapsed only) */}
              {!isExpanded && projectSessions.length > 0 && (
                <span style={{ display: "flex", gap: 2 }}>
                  {projectSessions.map((s) => (
                    <span
                      key={s.id}
                      style={{
                        width: 5,
                        height: 5,
                        borderRadius: "50%",
                        background: STATUS_COLORS[s.status],
                      }}
                    />
                  ))}
                </span>
              )}

              {/* Session count */}
              <span
                style={{
                  fontSize: 10,
                  color: "#484f58",
                  flexShrink: 0,
                }}
              >
                {projectSessions.length}
              </span>
            </div>

            {/* Active project path */}
            {isActive && (
              <div
                style={{
                  fontSize: 10,
                  color: "#484f58",
                  padding: "0 8px 4px 28px",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {project.path}
              </div>
            )}

            {/* Expanded session list */}
            {isExpanded && (
              <div
                style={{
                  paddingLeft: 16,
                  display: "flex",
                  flexDirection: "column",
                  gap: 1,
                }}
              >
                {visibleSessions.map((session) => (
                  <SessionItem
                    key={session.id}
                    session={session}
                    isActive={focusedSessionId === session.id}
                    onClick={() => onSelectSession(session.id)}
                    onContextMenu={(e) => {
                      const items: Array<ContextMenuItem | null> = [
                        {
                          label: "Rename",
                          action: () => onRenameSession?.(session),
                        },
                        null,
                        {
                          label: "Stop",
                          action: () => onStopSession?.(session),
                          disabled: session.status === "stopped",
                        },
                        {
                          label: "Restart",
                          action: () => onRestartSession?.(session),
                          disabled: session.status === "stopped",
                        },
                        {
                          label: "Resume",
                          action: () => onResumeSession?.(session),
                          disabled: session.status !== "stopped" || !session.resumeData,
                        },
                        null,
                        {
                          label: "Delete",
                          action: () => onDeleteSession?.(session),
                          danger: true,
                        },
                      ];
                      ctxMenu.show(e, items);
                    }}
                  />
                ))}
                {overflow > 0 && (
                  <span
                    style={{
                      fontSize: 10,
                      color: "#484f58",
                      padding: "2px 8px",
                    }}
                  >
                    + {overflow} more not in grid
                  </span>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
