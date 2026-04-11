/**
 * Development launcher: starts Vite renderer + Electron main process.
 * Bypasses Forge's process management which kills Electron on macOS.
 *
 * Requires: .vite/build/main.js to be pre-built by Forge (npm run start:forge once).
 * After the first Forge build, this script reuses the built main.js.
 *
 * Usage: npm start
 */

const { spawn, execFileSync } = require("child_process");
const path = require("path");
const fs = require("fs");
const http = require("http");

const ROOT = path.join(__dirname, "..");
const VITE_PORT = 5173;
const MAIN_JS = path.join(ROOT, ".vite/build/main.js");

// Check that main.js exists (needs one initial Forge build)
if (!fs.existsSync(MAIN_JS)) {
  console.error("[dev] .vite/build/main.js not found.");
  console.error("[dev] Run 'npm run start:forge' once to build the main process, then use 'npm start'.");
  process.exit(1);
}

// Free port 5173 if occupied (uses execFileSync with kill via signal)
try {
  const pids = execFileSync("lsof", ["-ti", `:${VITE_PORT}`], { encoding: "utf-8" }).trim();
  if (pids) {
    for (const pid of pids.split("\n")) {
      try { process.kill(Number(pid), "SIGKILL"); } catch {}
    }
  }
} catch {}

console.log("[dev] Starting Vite dev server...");
const vite = spawn("npx", ["vite", "--config", "vite.renderer.config.ts", "--port", String(VITE_PORT), "--strictPort"], {
  cwd: ROOT,
  stdio: "pipe",
});

vite.stdout.on("data", (d) => process.stdout.write(d));
vite.stderr.on("data", (d) => process.stderr.write(d));

function waitForVite(retries = 30) {
  return new Promise((resolve, reject) => {
    const check = () => {
      http.get(`http://localhost:${VITE_PORT}`, (res) => {
        resolve();
      }).on("error", () => {
        if (--retries <= 0) return reject(new Error("Vite did not start"));
        setTimeout(check, 500);
      });
    };
    check();
  });
}

waitForVite().then(() => {
  console.log(`[dev] Vite ready on port ${VITE_PORT}`);
  console.log("[dev] Launching Electron...");

  const electron = spawn(
    path.join(ROOT, "node_modules/.bin/electron"),
    [MAIN_JS],
    {
      cwd: ROOT,
      stdio: "inherit",
      env: { ...process.env, ELECTRON_ENABLE_LOGGING: "1" },
    }
  );

  electron.on("close", (code) => {
    console.log(`[dev] Electron exited with code ${code}`);
    vite.kill();
    process.exit(code || 0);
  });

  const cleanup = () => { electron.kill(); vite.kill(); process.exit(0); };
  process.on("SIGINT", cleanup);
  process.on("SIGTERM", cleanup);
}).catch((err) => {
  console.error("[dev]", err.message);
  vite.kill();
  process.exit(1);
});
