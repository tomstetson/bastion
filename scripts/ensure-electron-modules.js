/**
 * Ensures native modules (better-sqlite3, node-pty) are compiled for Electron's
 * Node ABI, not the system Node ABI. Runs before `npm start`.
 *
 * better-sqlite3 ships prebuilt binaries for system Node via prebuildify.
 * These get restored by npm install / electron-rebuild and cause ABI mismatch
 * crashes at runtime. This script detects the wrong binary and recompiles.
 */

const { execFileSync } = require("child_process");
const path = require("path");
const fs = require("fs");

const MODULES = ["better-sqlite3", "node-pty"];
const ELECTRON_VERSION = require("../node_modules/electron/package.json").version;
const ELECTRON_BINARY = require("electron");

function loadsInElectron(mod, modDir) {
  const script = mod === "better-sqlite3"
    ? `const Database = require(${JSON.stringify(modDir)}); const db = new Database(':memory:'); db.close();`
    : `require(${JSON.stringify(modDir)});`;
  try {
    execFileSync(ELECTRON_BINARY, ["-e", script], {
      env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
      stdio: "pipe",
      timeout: 15_000,
    });
    return true;
  } catch {
    return false;
  }
}

for (const mod of MODULES) {
  const modDir = path.join(__dirname, "..", "node_modules", mod);
  const prebuildsDir = path.join(modDir, "prebuilds");
  const markerFile = path.join(modDir, ".electron-abi-ok");

  // Delete prebuilds to prevent prebuildify from restoring wrong binaries
  if (fs.existsSync(prebuildsDir)) {
    fs.rmSync(prebuildsDir, { recursive: true });
    console.log(`[ensure-electron-modules] Deleted ${mod}/prebuilds/`);
  }

  // Check if we already compiled for this Electron version
  if (fs.existsSync(markerFile)) {
    const marker = fs.readFileSync(markerFile, "utf-8").trim();
    if (marker === ELECTRON_VERSION && loadsInElectron(mod, modDir)) {
      console.log(`[ensure-electron-modules] ${mod} already built for Electron ${ELECTRON_VERSION}`);
      continue;
    }
  }

  console.log(`[ensure-electron-modules] Compiling ${mod} for Electron ${ELECTRON_VERSION}...`);

  // Remove existing build
  if (fs.existsSync(path.join(modDir, "build"))) {
    fs.rmSync(path.join(modDir, "build"), { recursive: true });
  }

  // Compile from source targeting Electron using execFileSync (no shell injection)
  execFileSync("npx", [
    "--no-install", "node-gyp", "rebuild",
    `--target=${ELECTRON_VERSION}`,
    `--arch=${process.arch}`,
    "--dist-url=https://electronjs.org/headers",
    "--runtime=electron",
  ], { cwd: modDir, stdio: "inherit" });

  if (!loadsInElectron(mod, modDir)) {
    throw new Error(`${mod} did not load in Electron ${ELECTRON_VERSION} after rebuilding`);
  }

  // Write marker so we don't rebuild every time
  fs.writeFileSync(markerFile, ELECTRON_VERSION);
  console.log(`[ensure-electron-modules] ${mod} compiled successfully`);
}
