const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { chromium } = require('playwright');
const { spawn } = require('node:child_process');
const { once } = require('node:events');

// Exercise the actual packaged application against a disposable home directory.
// Never inherit provider tokens or touch the user's real session database.
async function main() {
  const executablePath = path.resolve(process.argv[2] || 'out/Bastion-darwin-arm64/Bastion.app/Contents/MacOS/Bastion');
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'bastion-runtime-'));
  const env = { USER: process.env.USER, LOGNAME: process.env.USER, HOME: home, TMPDIR: os.tmpdir(), PATH: '/usr/bin:/bin:/usr/sbin:/sbin', SHELL: '/bin/zsh', LANG: 'en_US.UTF-8' };
  let app;
  let child;
  async function launch() {
    child = spawn(executablePath, ['--remote-debugging-port=0', '--user-data-dir=' + path.join(home, 'chromium-profile')], { env, stdio: ['ignore', 'ignore', 'pipe'] });
    const endpoint = await new Promise((resolve, reject) => {
      let output = '';
      const timeout = setTimeout(() => reject(new Error('Packaged renderer did not start: ' + output.slice(-3000))), 30000);
      child.once('error', reject);
      child.stderr.on('data', chunk => {
        output += chunk.toString();
        const match = output.match(/DevTools listening on (ws:\/\/[^\s]+)/);
        if (match) { clearTimeout(timeout); resolve(match[1]); }
      });
    });
    app = await chromium.connectOverCDP(endpoint);
    return app.contexts()[0].pages()[0] || await app.contexts()[0].waitForEvent('page');
  }
  async function close() {
    if (app) { await app.close(); app = null; }
    if (child && child.exitCode === null) {
      const exited = once(child, 'exit'); child.kill('SIGTERM'); await exited;
    }
  }
  let sessionId;
  try {
    let page = await launch();
    await page.locator('[data-testid="sidebar"]').waitFor();
    const session = await page.evaluate(async (workingDir) => window.bastion.sessions.create({ name: 'maintenance-smoke', tool: 'shell', workingDir }), home);
    sessionId = session.id;
    assert.ok(sessionId);
    const output = await page.evaluate(async (id) => {
      await window.bastion.pty.subscribe(id);
      return await new Promise((resolve, reject) => {
        let output = '';
        const timeout = setTimeout(() => { off(); reject(new Error('PTY output timed out')); }, 10000);
        const off = window.bastion.pty.onData(id, (chunk) => {
          output += chunk;
          if (output.includes('maintenance-ok')) { clearTimeout(timeout); off(); resolve(output); }
        });
        window.bastion.pty.write(id, "printf 'maintenance-%s\\n' ok\n");
      });
    }, sessionId);
    assert.match(output, /maintenance-ok/);
    await page.evaluate(async (id) => { await window.bastion.popout.create(id, 'maintenance-smoke'); }, sessionId);
    assert.equal(await page.evaluate((id) => window.bastion.popout.exists(id), sessionId), true);
    await page.evaluate(async (id) => { await window.bastion.popout.close(id); await window.bastion.sessions.stop(id); }, sessionId);
    assert.ok(fs.existsSync(path.join(home, '.bastion')), 'App must use the disposable home');
    await close();
    page = await launch();
    await page.locator('[data-testid="sidebar"]').waitFor();
    const restored = await page.evaluate((id) => window.bastion.sessions.get(id), sessionId);
    assert.equal(restored.name, 'maintenance-smoke');
    await page.evaluate((id) => window.bastion.sessions.delete(id), sessionId);
    console.log('Packaged startup, SQLite persistence, PTY I/O and pop-out lifecycle passed.');
  } finally {
    await close();
    fs.rmSync(home, { recursive: true, force: true });
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
