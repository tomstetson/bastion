/**
 * Dialog for creating a new session.
 *
 * Three modes:
 * - "In [project]" (when active project exists): path pre-filled, pick tool + name
 * - "New Project": pick folder via native dialog, creates a new project
 * - "Standalone": pick folder, session without a project
 *
 * Escape or backdrop click closes the dialog.
 */

import React, { useState, useRef, useEffect, useCallback } from "react";
import { useUIStore } from "../../store/ui";
import { useProjectsStore } from "../../store/projects";
import { useSessionsStore } from "../../store/sessions";
import type { Tool } from "../../../electron/core/types";

interface NewSessionDialogProps {
  onClose: () => void;
}

type Mode = "project" | "new-project" | "standalone";

const TOOLS: Array<{ value: Tool; label: string }> = [
  { value: "claude", label: "Claude Code" },
  { value: "codex", label: "Codex" },
  { value: "gemini", label: "Gemini" },
  { value: "shell", label: "Shell" },
  { value: "custom", label: "Custom" },
];

export default function NewSessionDialog({ onClose }: NewSessionDialogProps) {
  const activeProjectId = useUIStore((s) => s.activeProjectId);
  const projects = useProjectsStore((s) => s.projects);
  const createProject = useProjectsStore((s) => s.createProject);
  const createSession = useSessionsStore((s) => s.createSession);

  const activeProject = projects.find((p) => p.id === activeProjectId) ?? null;

  // Default mode: "project" if there's an active project, otherwise "standalone"
  const [mode, setMode] = useState<Mode>(activeProject ? "project" : "standalone");
  const [tool, setTool] = useState<Tool>("claude");
  const [customCommand, setCustomCommand] = useState("");
  const [name, setName] = useState("");
  const [folderPath, setFolderPath] = useState("");
  const [projectName, setProjectName] = useState("");
  const [creating, setCreating] = useState(false);

  const nameRef = useRef<HTMLInputElement>(null);

  // Focus name input on mount
  useEffect(() => {
    nameRef.current?.focus();
  }, []);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  const handlePickFolder = useCallback(async () => {
    const result = await window.bastion.dialog.openFolder();
    if (result) {
      setFolderPath(result);
      // Auto-fill project name from folder name
      if (!projectName) {
        const parts = result.split("/");
        setProjectName(parts[parts.length - 1] || "");
      }
    }
  }, [projectName]);

  const handleCreate = useCallback(async () => {
    setCreating(true);
    try {
      let projectId: string | undefined;
      let workingDir: string;

      if (mode === "project" && activeProject) {
        projectId = activeProject.id;
        workingDir = activeProject.path;
      } else if (mode === "new-project") {
        if (!folderPath) return;
        // Create the project first
        await createProject(projectName || folderPath.split("/").pop() || "Project", folderPath);
        // Fetch updated projects to find the new one
        const updatedProjects = await window.bastion.projects.list();
        const newProject = updatedProjects.find((p) => p.path === folderPath);
        projectId = newProject?.id;
        workingDir = folderPath;
      } else {
        // Standalone
        if (!folderPath) return;
        workingDir = folderPath;
      }

      await createSession({
        name: name || undefined,
        tool,
        command: tool === "custom" ? customCommand : undefined,
        workingDir,
        projectId,
      });

      onClose();
    } catch (err) {
      console.error("Failed to create session:", err);
    } finally {
      setCreating(false);
    }
  }, [mode, activeProject, folderPath, projectName, name, tool, customCommand, createProject, createSession, onClose]);

  // Determine if Create button should be enabled
  const canCreate =
    !creating &&
    (mode === "project"
      ? !!activeProject
      : !!folderPath) &&
    (tool !== "custom" || customCommand.trim().length > 0);

  const tabs: Array<{ mode: Mode; label: string; available: boolean }> = [
    { mode: "project", label: activeProject ? `In ${activeProject.name}` : "In Project", available: !!activeProject },
    { mode: "new-project", label: "New Project", available: true },
    { mode: "standalone", label: "Standalone", available: true },
  ];

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.6)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 100,
      }}
      onClick={onClose}
    >
      <div
        data-testid="new-session-dialog"
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "#161b22",
          border: "1px solid #30363d",
          borderRadius: 8,
          padding: 0,
          minWidth: 420,
          maxWidth: 500,
          color: "#c9d1d9",
          fontSize: 14,
          overflow: "hidden",
        }}
      >
        {/* Header */}
        <div style={{ padding: "16px 20px 0" }}>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: "#c9d1d9" }}>
            New Session
          </h2>
        </div>

        {/* Mode tabs */}
        <div
          style={{
            display: "flex",
            gap: 0,
            borderBottom: "1px solid #30363d",
            padding: "12px 20px 0",
          }}
        >
          {tabs.map((tab) => (
            <button
              key={tab.mode}
              onClick={() => tab.available && setMode(tab.mode)}
              disabled={!tab.available}
              style={{
                padding: "8px 16px",
                fontSize: 12,
                fontWeight: 500,
                background: "transparent",
                border: "none",
                borderBottom: mode === tab.mode ? "2px solid #58a6ff" : "2px solid transparent",
                color: !tab.available
                  ? "#484f58"
                  : mode === tab.mode
                    ? "#58a6ff"
                    : "#8b949e",
                cursor: tab.available ? "pointer" : "default",
                transition: "color 100ms",
                marginBottom: -1,
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Body */}
        <div style={{ padding: "16px 20px", display: "flex", flexDirection: "column", gap: 16 }}>
          {/* Folder picker — shown for new-project and standalone modes */}
          {mode !== "project" && (
            <div>
              <label style={{ fontSize: 12, color: "#8b949e", display: "block", marginBottom: 6 }}>
                Working Directory
              </label>
              <div style={{ display: "flex", gap: 8 }}>
                <div
                  style={{
                    flex: 1,
                    padding: "6px 10px",
                    borderRadius: 4,
                    border: "1px solid #30363d",
                    background: "#0d1117",
                    color: folderPath ? "#c9d1d9" : "#484f58",
                    fontSize: 13,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {folderPath || "No folder selected"}
                </div>
                <button
                  onClick={handlePickFolder}
                  style={{
                    padding: "6px 12px",
                    borderRadius: 4,
                    border: "1px solid #30363d",
                    background: "#21262d",
                    color: "#c9d1d9",
                    cursor: "pointer",
                    fontSize: 12,
                    flexShrink: 0,
                  }}
                >
                  Browse...
                </button>
              </div>
            </div>
          )}

          {/* Path display for "in project" mode */}
          {mode === "project" && activeProject && (
            <div>
              <label style={{ fontSize: 12, color: "#8b949e", display: "block", marginBottom: 6 }}>
                Working Directory
              </label>
              <div
                style={{
                  padding: "6px 10px",
                  borderRadius: 4,
                  border: "1px solid #30363d",
                  background: "#0d1117",
                  color: "#484f58",
                  fontSize: 13,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {activeProject.path}
              </div>
            </div>
          )}

          {/* Project name — only for new-project mode */}
          {mode === "new-project" && (
            <div>
              <label style={{ fontSize: 12, color: "#8b949e", display: "block", marginBottom: 6 }}>
                Project Name
              </label>
              <input
                type="text"
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
                placeholder="Auto-detected from folder"
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
            </div>
          )}

          {/* Tool selector */}
          <div>
            <label style={{ fontSize: 12, color: "#8b949e", display: "block", marginBottom: 6 }}>
              Tool
            </label>
            <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
              {TOOLS.map((t) => (
                <button
                  key={t.value}
                  data-testid={`tool-${t.value}`}
                  onClick={() => setTool(t.value)}
                  style={{
                    padding: "6px 14px",
                    borderRadius: 4,
                    border: tool === t.value ? "1px solid #58a6ff" : "1px solid #30363d",
                    background: tool === t.value ? "#58a6ff22" : "#21262d",
                    color: tool === t.value ? "#58a6ff" : "#c9d1d9",
                    cursor: "pointer",
                    fontSize: 12,
                    fontWeight: 500,
                    transition: "all 100ms",
                  }}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* Custom command input */}
          {tool === "custom" && (
            <div>
              <label style={{ fontSize: 12, color: "#8b949e", display: "block", marginBottom: 6 }}>
                Custom Command
              </label>
              <input
                type="text"
                value={customCommand}
                onChange={(e) => setCustomCommand(e.target.value)}
                placeholder="e.g. python main.py"
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
            </div>
          )}

          {/* Session name */}
          <div>
            <label style={{ fontSize: 12, color: "#8b949e", display: "block", marginBottom: 6 }}>
              Session Name
              <span style={{ color: "#484f58", fontWeight: 400 }}> (optional)</span>
            </label>
            <input
              ref={nameRef}
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Auto-generated if empty"
              onKeyDown={(e) => {
                if (e.key === "Enter" && canCreate) handleCreate();
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
          </div>
        </div>

        {/* Footer buttons */}
        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            gap: 8,
            padding: "12px 20px",
            borderTop: "1px solid #30363d",
          }}
        >
          <button
            data-testid="cancel-btn"
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
            data-testid="create-btn"
            onClick={handleCreate}
            disabled={!canCreate}
            style={{
              padding: "6px 16px",
              borderRadius: 4,
              border: "1px solid #238636",
              background: canCreate ? "#238636" : "#21262d",
              color: canCreate ? "#ffffff" : "#484f58",
              cursor: canCreate ? "pointer" : "default",
              fontSize: 13,
              fontWeight: 600,
            }}
          >
            {creating ? "Creating..." : "Create"}
          </button>
        </div>
      </div>
    </div>
  );
}
