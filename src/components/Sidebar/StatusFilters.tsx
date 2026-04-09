/**
 * Horizontal row of pill badges for filtering sessions by status.
 * Hidden pills when count is 0. Click toggles the active filter.
 */

import React from "react";
import type { SessionStatus } from "../../../electron/core/types";

const STATUS_CONFIG: Array<{
  status: SessionStatus;
  label: string;
  color: string;
}> = [
  { status: "running", label: "Running", color: "#3fb950" },
  { status: "waiting", label: "Waiting", color: "#d29922" },
  { status: "error", label: "Error", color: "#f85149" },
  { status: "idle", label: "Idle", color: "#8b949e" },
];

interface StatusFiltersProps {
  counts: Record<SessionStatus, number>;
  activeFilter: string | null;
  onFilterChange: (status: string | null) => void;
}

export default function StatusFilters({
  counts,
  activeFilter,
  onFilterChange,
}: StatusFiltersProps) {
  const visibleStatuses = STATUS_CONFIG.filter((s) => counts[s.status] > 0);

  if (visibleStatuses.length === 0) return null;

  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap: 4,
        padding: "0 12px",
        marginBottom: 12,
      }}
    >
      {visibleStatuses.map(({ status, label, color }) => {
        const isActive = activeFilter === status;
        return (
          <button
            key={status}
            onClick={() => onFilterChange(isActive ? null : status)}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              padding: "2px 8px",
              fontSize: 10,
              fontWeight: 500,
              borderRadius: 10,
              border: `1px solid ${isActive ? color : "#30363d"}`,
              background: isActive ? `${color}22` : "transparent",
              color: isActive ? color : "#8b949e",
              cursor: "pointer",
              transition: "all 100ms",
            }}
          >
            <span
              style={{
                width: 5,
                height: 5,
                borderRadius: "50%",
                background: color,
              }}
            />
            {label} {counts[status]}
          </button>
        );
      })}
    </div>
  );
}
