import React from "react";
import { createRoot } from "react-dom/client";
import PopOutTerminal from "./components/PopOut/PopOutTerminal";
import "@xterm/xterm/css/xterm.css";

const params = new URLSearchParams(window.location.search);
const sessionId = params.get("sessionId");

const root = createRoot(document.getElementById("root")!);

if (!sessionId) {
  root.render(<div style={{ padding: 20, color: "#f85149" }}>Error: No session ID provided</div>);
} else {
  root.render(<PopOutTerminal sessionId={sessionId} />);
}
