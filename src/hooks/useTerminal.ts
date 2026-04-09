/**
 * React hook that manages an xterm.js Terminal instance connected to a PTY
 * session via the IPC bridge.
 *
 * Handles:
 * - Terminal creation with GitHub dark theme
 * - FitAddon + WebglAddon (with canvas fallback)
 * - PTY data subscription (buffered output on mount)
 * - Bidirectional data flow (PTY <-> terminal)
 * - ResizeObserver for auto-fit
 * - Full cleanup on unmount
 */

import { useRef, useEffect, useCallback } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebglAddon } from "@xterm/addon-webgl";
import "@xterm/xterm/css/xterm.css";

const THEME = {
  background: "#0d1117",
  foreground: "#c9d1d9",
  cursor: "#58a6ff",
  cursorAccent: "#0d1117",
  selectionBackground: "#264f78",
  selectionForeground: "#c9d1d9",
  black: "#484f58",
  red: "#f85149",
  green: "#3fb950",
  yellow: "#d29922",
  blue: "#58a6ff",
  magenta: "#bc8cff",
  cyan: "#39d353",
  white: "#c9d1d9",
  brightBlack: "#6e7681",
  brightRed: "#ffa198",
  brightGreen: "#56d364",
  brightYellow: "#e3b341",
  brightBlue: "#79c0ff",
  brightMagenta: "#d2a8ff",
  brightCyan: "#56d364",
  brightWhite: "#f0f6fc",
};

interface UseTerminalOptions {
  sessionId: string;
}

export function useTerminal({ sessionId }: UseTerminalOptions) {
  const containerRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);

  const fit = useCallback(() => {
    fitAddonRef.current?.fit();
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Create terminal
    const terminal = new Terminal({
      theme: THEME,
      fontFamily: "'SF Mono', 'Menlo', 'Monaco', 'Courier New', monospace",
      fontSize: 13,
      cursorBlink: true,
      scrollback: 5000,
      allowProposedApi: true,
    });
    terminalRef.current = terminal;

    // Load FitAddon (required)
    const fitAddon = new FitAddon();
    fitAddonRef.current = fitAddon;
    terminal.loadAddon(fitAddon);

    // Open terminal in DOM
    terminal.open(container);

    // Try WebGL addon, fall back to canvas renderer on error
    try {
      const webglAddon = new WebglAddon();
      webglAddon.onContextLoss(() => {
        webglAddon.dispose();
      });
      terminal.loadAddon(webglAddon);
    } catch {
      // Canvas renderer is the default fallback — no addon needed
      console.warn("WebGL addon failed, using canvas renderer");
    }

    // Initial fit
    fitAddon.fit();

    // Track cleanup functions
    const cleanups: Array<() => void> = [];

    // Subscribe to PTY data — returns buffered output
    let mounted = true;
    window.bastion.pty.subscribe(sessionId).then((buffered) => {
      if (!mounted) return;
      if (buffered) {
        terminal.write(buffered);
      }
    });

    // PTY data → terminal
    const unsubData = window.bastion.pty.onData(sessionId, (data) => {
      terminal.write(data);
    });
    cleanups.push(unsubData);

    // PTY exit → show message
    const unsubExit = window.bastion.pty.onExit(sessionId, (code) => {
      terminal.write(`\r\n\x1b[90m[Session ended with code ${code}]\x1b[0m\r\n`);
    });
    cleanups.push(unsubExit);

    // Terminal input → PTY
    const onDataDisposable = terminal.onData((data) => {
      window.bastion.pty.write(sessionId, data);
    });
    cleanups.push(() => onDataDisposable.dispose());

    // Terminal resize → PTY
    const onResizeDisposable = terminal.onResize(({ cols, rows }) => {
      window.bastion.pty.resize(sessionId, cols, rows);
    });
    cleanups.push(() => onResizeDisposable.dispose());

    // ResizeObserver → fit terminal to container
    const resizeObserver = new ResizeObserver(() => {
      // requestAnimationFrame avoids layout thrashing
      requestAnimationFrame(() => {
        if (mounted) {
          fitAddon.fit();
        }
      });
    });
    resizeObserver.observe(container);
    cleanups.push(() => resizeObserver.disconnect());

    return () => {
      mounted = false;
      for (const cleanup of cleanups) {
        cleanup();
      }
      terminal.dispose();
      terminalRef.current = null;
      fitAddonRef.current = null;
    };
  }, [sessionId]);

  return { containerRef, fit, terminal: terminalRef };
}
