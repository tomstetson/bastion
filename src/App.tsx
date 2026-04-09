import React from "react";

export default function App() {
  return (
    <div style={{ display: "flex", height: "100vh" }}>
      {/* Sidebar */}
      <aside
        style={{
          width: 220,
          minWidth: 220,
          background: "#010409",
          borderRight: "1px solid #21262d",
          display: "flex",
          flexDirection: "column",
          padding: "16px 12px",
        }}
      >
        <h1
          style={{
            fontSize: 13,
            fontWeight: 700,
            letterSpacing: "0.08em",
            color: "#58a6ff",
            marginBottom: 24,
          }}
        >
          BASTION
        </h1>
        <p style={{ fontSize: 12, color: "#484f58" }}>No sessions</p>
      </aside>

      {/* Main area */}
      <main
        style={{
          flex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#0d1117",
        }}
      >
        <p style={{ fontSize: 14, color: "#484f58" }}>
          Terminal grid placeholder
        </p>
      </main>
    </div>
  );
}
