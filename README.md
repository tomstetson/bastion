# Bastion

Security-hardened terminal agent orchestrator. Run multiple AI coding agents in parallel and manage them from a single TUI dashboard.

> Originally forked from [agent-view](https://github.com/frayo44/agent-view) by Frayo44

## Why Bastion?

When working with AI coding agents, you often need to run multiple agents on different tasks — one refactoring a module, another writing tests, a third exploring a bug. Bastion lets you orchestrate all of them from one place instead of juggling terminal tabs.

Bastion adds security hardening on top of the upstream agent-view project: no shell injection vectors, restrictive directory permissions, symlink-safe signal files, SQL field allowlists, and input validation at system boundaries.

## Features

- **Multi-agent dashboard** — Monitor all sessions from one terminal
- **Real-time status** — See which agents are running, waiting for input, idle, or errored
- **Tool support** — Claude Code, OpenCode, Gemini CLI, Codex, custom commands
- **Git worktrees** — Isolate each agent in its own worktree branch
- **Session forking** — Fork Claude conversations to explore different approaches
- **Destructive action safeguards** — Confirmation dialogs for restart and delete operations
- **Security hardened** — No shell injection, restrictive permissions, input validation

## Status Indicators

| Icon | Status | Meaning |
|------|--------|---------|
| ● | Running | Agent is actively working |
| ◐ | Waiting | Agent needs your input |
| ○ | Idle | Session exists, agent is not active |
| ✕ | Error | Something went wrong |
| □ | Stopped | Session was explicitly stopped |

## Installation

```bash
curl -fsSL https://raw.githubusercontent.com/tomstetson/bastion/main/install.sh | bash
```

Or install from source:

```bash
git clone https://github.com/tomstetson/bastion.git
cd bastion
bun install
bun run build
```

## Usage

```bash
bastion          # Launch the TUI
bn               # Short alias
```

### Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `n` | New session |
| `Enter` | Attach to session |
| `d` | Delete session (with confirmation) |
| `r` | Restart session (with confirmation) |
| `f` | Fork Claude session |
| `R` | Rename session |
| `g` | Create group |
| `m` | Move session to group |
| `s` | Shortcuts |
| `Ctrl+K` | Command palette |
| `q` | Quit |

### CLI Mode

```bash
bn --new --path /my/project --tool claude
bn --list
bn --attach <session-id>
bn --send <session-id> "Fix the login bug"
bn --stop <session-id>
bn --delete <session-id>
```

## Configuration

Create `~/.bastion/config.json` to customize:

```json
{
  "defaultTool": "claude",
  "theme": "dark",
  "worktree": {
    "defaultBaseBranch": "main",
    "autoCleanup": true
  },
  "shortcuts": [
    {
      "name": "My Project",
      "tool": "claude",
      "projectPath": "/path/to/project",
      "groupPath": "work",
      "keybind": "1"
    }
  ]
}
```

## License

MIT — see [LICENSE](LICENSE)
