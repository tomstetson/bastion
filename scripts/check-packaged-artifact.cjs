const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const asar = require("@electron/asar");
function archives(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const name = path.join(directory, entry.name);
    return entry.isDirectory() ? archives(name) : entry.name === "app.asar" ? [name] : [];
  });
}
const packages = archives("out");
assert.ok(packages.length, "No packaged application found");
for (const archive of packages) {
  const files = asar.listPackage(archive);
  for (const name of ["/.vite/build/main.js", "/.vite/build/preload.js", "/.vite/renderer/main_window/index.html", "/.vite/renderer/main_window/popout.html", "/node_modules/better-sqlite3/package.json", "/node_modules/node-pty/package.json"]) {
    assert.ok(files.includes(name), archive + " is missing " + name);
  }
  const unpacked = archive + ".unpacked";
  assert.ok(fs.existsSync(path.join(unpacked, "node_modules/better-sqlite3/build/Release/better_sqlite3.node")), "Packaged SQLite native module missing");
  assert.ok(fs.existsSync(path.join(unpacked, "node_modules/node-pty/build/Release/spawn-helper")), "Packaged PTY spawn helper missing");
}
console.log("Packaged main, preload, renderer pages and native runtime dependencies verified");
