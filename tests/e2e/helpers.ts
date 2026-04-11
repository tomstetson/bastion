/**
 * E2E test helpers for Bastion Electron app.
 *
 * Provides reusable utilities for launching the app, creating sessions,
 * and cleaning up after tests. Uses Playwright's Electron support.
 */

import { _electron as electron } from "playwright";
import type { ElectronApplication, Page } from "playwright";
import { createServer } from "vite";
import type { ViteDevServer } from "vite";
import path from "path";
import fs from "fs";
import os from "os";
import { execFileSync } from "child_process";

const ROOT = path.resolve(__dirname, "../..");
const MAIN_JS = path.join(ROOT, ".vite/build/main.js");

/**
 * Extract the dev server port baked into main.js by Electron Forge.
 */
export function extractDevPort(): number {
  const content = fs.readFileSync(MAIN_JS, "utf-8");
  const match = content.match(/http:\/\/localhost:(\d+)/);
  if (!match) {
    throw new Error(
      "Cannot find baked-in localhost port in main.js. Run `npm start` first.",
    );
  }
  return parseInt(match[1], 10);
}

/**
 * Launch the full Bastion Electron app with a Vite dev server.
 * Returns handles for the app, first window, and Vite server.
 */
export async function launchApp(): Promise<{
  app: ElectronApplication;
  window: Page;
  viteServer: ViteDevServer;
}> {
  if (!fs.existsSync(MAIN_JS)) {
    throw new Error(
      ".vite/build/main.js not found. Run `npm start` once to build it.",
    );
  }

  // Rebuild native modules for Electron ABI
  execFileSync("npx", ["@electron/rebuild", "-f"], {
    cwd: ROOT,
    stdio: "pipe",
  });

  const port = extractDevPort();

  // Start Vite dev server for renderer
  const viteServer = await createServer({
    root: path.join(ROOT, "src"),
    configFile: path.join(ROOT, "vite.renderer.config.ts"),
    server: { port, strictPort: true },
  });
  await viteServer.listen();

  // Launch Electron
  const app = await electron.launch({
    args: [MAIN_JS],
    env: {
      ...process.env,
      NODE_ENV: "development",
    },
  });

  const window = await app.firstWindow();
  // Wait for renderer to hydrate
  await window.waitForSelector('[data-testid="sidebar"]', { timeout: 10000 });

  return { app, window, viteServer };
}

/**
 * Create a shell session via the New Session dialog.
 * Uses a temp directory as the working directory.
 */
export async function createShellSession(
  window: Page,
  app: ElectronApplication,
  name?: string,
): Promise<string> {
  // Create a temp directory for the session
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "bastion-e2e-"));

  // Click + New button
  await window.click('[data-testid="new-button"]');
  await window.waitForSelector('[data-testid="new-session-dialog"]', {
    timeout: 3000,
  });

  // Click "Standalone" tab (should be available)
  const standaloneTab = window.locator("button", { hasText: "Standalone" });
  await standaloneTab.click();

  // Click Browse and handle the native dialog
  // We need to mock the dialog since it's native
  await app.evaluate(async ({ dialog }, dirPath) => {
    dialog.showOpenDialog = async () => ({
      canceled: false,
      filePaths: [dirPath],
    });
  }, tmpDir);

  const browseButton = window.locator("button", { hasText: "Browse..." });
  await browseButton.click();

  // Wait for path to appear
  await window.waitForTimeout(500);

  // Select Shell tool
  await window.click('[data-testid="tool-shell"]');

  // Optionally set a name
  if (name) {
    const nameInput = window.locator('input[placeholder="Auto-generated if empty"]');
    await nameInput.fill(name);
  }

  // Click Create
  await window.click('[data-testid="create-btn"]');

  // Wait for dialog to close and session to appear
  await window.waitForSelector('[data-testid="new-session-dialog"]', {
    state: "detached",
    timeout: 5000,
  });

  // Wait for the terminal tile to appear
  await window.waitForSelector('[data-testid="terminal-tile"]', {
    timeout: 5000,
  });

  return tmpDir;
}

/**
 * Clean up after E2E tests.
 * Closes the app, Vite server, and rebuilds native modules for system Node.
 */
export async function cleanup(
  app: ElectronApplication | null,
  viteServer: ViteDevServer | null,
): Promise<void> {
  if (app) {
    await app.close();
  }
  if (viteServer) {
    await viteServer.close();
  }

  // Rebuild native modules for system Node so vitest works afterward
  for (const mod of ["better-sqlite3", "node-pty"]) {
    const marker = path.join(ROOT, "node_modules", mod, ".electron-abi-ok");
    if (fs.existsSync(marker)) fs.unlinkSync(marker);
  }
  execFileSync("npm", ["run", "rebuild:node"], {
    cwd: ROOT,
    stdio: "pipe",
  });
}
