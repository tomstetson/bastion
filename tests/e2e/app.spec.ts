/**
 * End-to-end tests for Bastion Electron app.
 *
 * Uses Playwright's Electron support to launch the real app and verify
 * that the UI renders correctly, dialogs open/close, and grid buttons work.
 *
 * Requires: `npm start` must have been run at least once to generate
 * .vite/build/main.js and .vite/build/preload.js (Forge builds these).
 *
 * Strategy:
 * 1. Start a Vite dev server for the renderer on the port baked into main.js
 * 2. Launch Electron via Playwright pointing at the pre-built main.js
 */

import { test, expect } from "@playwright/test";
import { _electron as electron } from "playwright";
import type { ElectronApplication, Page } from "playwright";
import { createServer } from "vite";
import type { ViteDevServer } from "vite";
import path from "path";
import fs from "fs";
import { execFileSync } from "child_process";

const ROOT = path.resolve(__dirname, "../..");
const MAIN_JS = path.join(ROOT, ".vite/build/main.js");

/**
 * Extract the dev server port from the built main.js.
 * Forge bakes the Vite dev server URL into the bundle at build time.
 */
function extractDevPort(): number {
  const content = fs.readFileSync(MAIN_JS, "utf-8");
  const match = content.match(/http:\/\/localhost:(\d+)/);
  if (!match) {
    throw new Error(
      "Cannot find baked-in localhost port in main.js. Run `npm start` first to generate it.",
    );
  }
  return parseInt(match[1], 10);
}

let electronApp: ElectronApplication;
let page: Page;
let viteServer: ViteDevServer;

test.beforeAll(async () => {
  // Verify main.js exists
  if (!fs.existsSync(MAIN_JS)) {
    throw new Error(
      ".vite/build/main.js not found. Run `npm start` once to build it.",
    );
  }

  // Rebuild native modules for Electron's ABI (they may be built for system Node)
  execFileSync("npx", ["@electron/rebuild", "-f"], {
    cwd: ROOT,
    stdio: "pipe",
  });

  const port = extractDevPort();

  // 1. Start Vite dev server for renderer on the baked-in port
  viteServer = await createServer({
    root: path.join(ROOT, "src"),
    configFile: path.join(ROOT, "vite.renderer.config.ts"),
    server: { port, strictPort: true },
  });
  await viteServer.listen();

  // 2. Launch Electron with the Forge-built main.js
  electronApp = await electron.launch({
    args: [MAIN_JS],
    env: {
      ...process.env,
      NODE_ENV: "development",
    },
  });

  // Wait for first window
  page = await electronApp.firstWindow();
  // Give the renderer time to hydrate
  await page.waitForTimeout(3000);
});

test.afterAll(async () => {
  if (electronApp) {
    await electronApp.close();
  }
  if (viteServer) {
    await viteServer.close();
  }

  // Rebuild native modules back to system Node so `npm test` works afterward.
  // Clear Electron ABI markers first so ensure-electron-modules.js knows
  // it needs to recompile next time Electron starts.
  for (const mod of ["better-sqlite3", "node-pty"]) {
    const marker = path.join(ROOT, "node_modules", mod, ".electron-abi-ok");
    if (fs.existsSync(marker)) fs.unlinkSync(marker);
  }
  execFileSync("npm", ["run", "rebuild:node"], {
    cwd: ROOT,
    stdio: "pipe",
  });
});

test("app window opens", async () => {
  const title = await page.title();
  expect(title).toBe("Bastion");
});

test("sidebar is visible with BASTION header", async () => {
  const bastionHeader = page.locator("text=BASTION");
  await expect(bastionHeader).toBeVisible({ timeout: 5000 });
});

test("+ New button is visible and clickable", async () => {
  const newButton = page.locator("button", { hasText: "+ New" });
  await expect(newButton).toBeVisible({ timeout: 5000 });
});

test("clicking + New opens the new session dialog", async () => {
  const newButton = page.locator("button", { hasText: "+ New" });
  await newButton.click();

  // Use the h2 heading specifically to avoid matching ghost tile text
  const dialogHeading = page.getByRole("heading", { name: "New Session" });
  await expect(dialogHeading).toBeVisible({ timeout: 3000 });
});

test("can dismiss new session dialog with Escape", async () => {
  // Ensure dialog is open by checking for the h2 heading
  const dialogHeading = page.getByRole("heading", { name: "New Session" });
  const isVisible = await dialogHeading.isVisible();
  if (!isVisible) {
    const newButton = page.locator("button", { hasText: "+ New" });
    await newButton.click();
    await expect(dialogHeading).toBeVisible({ timeout: 3000 });
  }

  // Press Escape
  await page.keyboard.press("Escape");

  // Dialog should be gone
  await expect(dialogHeading).not.toBeVisible({ timeout: 3000 });
});

test("grid layout buttons are visible in toolbar", async () => {
  const button1x1 = page.locator("button", { hasText: "1x1" });
  const button2x1 = page.locator("button", { hasText: "2x1" });
  const button2x2 = page.locator("button", { hasText: "2x2" });
  const button3x2 = page.locator("button", { hasText: "3x2" });
  const buttonAuto = page.locator("button", { hasText: "Auto" });

  await expect(button1x1).toBeVisible({ timeout: 5000 });
  await expect(button2x1).toBeVisible();
  await expect(button2x2).toBeVisible();
  await expect(button3x2).toBeVisible();
  await expect(buttonAuto).toBeVisible();
});

test("grid layout buttons are clickable", async () => {
  // Click 2x2 layout button (different from default "auto")
  const button2x2 = page.locator("button", { hasText: "2x2" });
  await button2x2.click();

  // Wait for state update to propagate
  await page.waitForTimeout(500);

  // After clicking, the button's inline style should have the active border color
  // React converts #58a6ff to rgb(88, 166, 255) in the rendered style attribute
  const style = await button2x2.getAttribute("style");
  expect(style).toContain("rgb(88, 166, 255)");
});

test("standalone sessions text appears in toolbar", async () => {
  const standaloneText = page.locator("text=Standalone sessions");
  await expect(standaloneText).toBeVisible({ timeout: 5000 });
});

test("session count footer is visible in sidebar", async () => {
  const footer = page.locator("text=session");
  await expect(footer.first()).toBeVisible({ timeout: 5000 });
});
