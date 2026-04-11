/**
 * Cmd+K command palette overlay.
 *
 * Fuzzy-searches across all sessions using fuzzysort.
 * Each result shows: status dot, session name, project name, tool badge.
 * Enter/click navigates to the session (sets active project + focused tile).
 * Renders as an overlay at the top of the screen (like VS Code Cmd+P).
 */

import React, { useState, useRef, useEffect, useMemo, useCallback } from "react";
import fuzzysort from "fuzzysort";
import { useSessionsStore } from "../../store/sessions";
import { useProjectsStore } from "../../store/projects";
import { useUIStore } from "../../store/ui";
import type { Session, SessionStatus } from "../../../electron/core/types";

interface CommandPaletteProps {
  onClose: () => void;
}

const STATUS_COLORS: Record<SessionStatus, string> = {
  running: "#3fb950",
  waiting: "#d29922",
  idle: "#8b949e",
  error: "#f85149",
  stopped: "#484f58",
};

const TOOL_LABELS: Record<string, string> = {
  claude: "Claude",
  opencode: "OpenCode",
  gemini: "Gemini",
  codex: "Codex",
  custom: "Custom",
  shell: "Shell",
};

export default function CommandPalette({ onClose }: CommandPaletteProps) {
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const sessions = useSessionsStore((s) => s.sessions);
  const projects = useProjectsStore((s) => s.projects);
  const setActiveProject = useUIStore((s) => s.setActiveProject);
  const setFocusedTile = useUIStore((s) => s.setFocusedTile);

  // Build a project lookup map
  const projectMap = useMemo(() => {
    const map: Record<string, string> = {};
    for (const p of projects) {
      map[p.id] = p.name;
    }
    return map;
  }, [projects]);

  // Fuzzy search results
  const results: Session[] = useMemo(() => {
    if (!query.trim()) return sessions;

    const fuzzied = fuzzysort.go(query, sessions, {
      keys: ["name", "tool"],
      limit: 20,
    });

    return fuzzied.map((r) => r.obj);
  }, [query, sessions]);

  // Keep selectedIndex in bounds
  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", handler, true);
    return () => window.removeEventListener("keydown", handler, true);
  }, [onClose]);

  const navigateToSession = useCallback(
    (session: Session) => {
      setFocusedTile(session.id);
      if (session.projectId) {
        setActiveProject(session.projectId);
      } else {
        setActiveProject(null);
      }
      onClose();
    },
    [setFocusedTile, setActiveProject, onClose],
  );

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((prev) => Math.min(prev + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((prev) => Math.max(prev - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (results[selectedIndex]) {
        navigateToSession(results[selectedIndex]);
      }
    }
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.4)",
        display: "flex",
        justifyContent: "center",
        paddingTop: 80,
        zIndex: 120,
      }}
      onClick={onClose}
    >
      <div
        data-testid="command-palette"
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "#161b22",
          border: "1px solid #30363d",
          borderRadius: 8,
          width: 500,
          maxHeight: 400,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
        }}
      >
        {/* Search input */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "10px 14px",
            borderBottom: "1px solid #30363d",
          }}
        >
          <span style={{ color: "#484f58", fontSize: 14 }}>&#128269;</span>
          <input
            ref={inputRef}
            data-testid="palette-search"
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search sessions..."
            style={{
              flex: 1,
              background: "transparent",
              border: "none",
              color: "#c9d1d9",
              fontSize: 14,
              outline: "none",
            }}
          />
        </div>

        {/* Results list */}
        <div
          style={{
            flex: 1,
            overflowY: "auto",
            padding: "4px 0",
          }}
        >
          {results.length === 0 && (
            <div
              style={{
                padding: "16px 14px",
                color: "#484f58",
                fontSize: 13,
                textAlign: "center",
              }}
            >
              No sessions found
            </div>
          )}
          {results.map((session, idx) => (
            <div
              key={session.id}
              onClick={() => navigateToSession(session)}
              onMouseEnter={() => setSelectedIndex(idx)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "8px 14px",
                cursor: "pointer",
                background: idx === selectedIndex ? "#1c2128" : "transparent",
              }}
            >
              {/* Status dot */}
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  background: STATUS_COLORS[session.status],
                  flexShrink: 0,
                }}
              />

              {/* Session name */}
              <span
                style={{
                  flex: 1,
                  fontSize: 13,
                  color: "#c9d1d9",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {session.name}
              </span>

              {/* Project name */}
              {session.projectId && projectMap[session.projectId] && (
                <span
                  style={{
                    fontSize: 11,
                    color: "#484f58",
                    flexShrink: 0,
                  }}
                >
                  {projectMap[session.projectId]}
                </span>
              )}

              {/* Tool badge */}
              <span
                style={{
                  fontSize: 10,
                  padding: "1px 6px",
                  borderRadius: 3,
                  background: "#30363d",
                  color: "#8b949e",
                  flexShrink: 0,
                }}
              >
                {TOOL_LABELS[session.tool] || session.tool}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
