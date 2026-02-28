Use the `bn` CLI to manage bastion sessions without the TUI.

## Create a session

```bash
bn --new --path $PROJECT_PATH --tool claude
```

Flags:
- `--path <dir>` — Project directory (default: cwd)
- `--tool <name>` — claude | opencode | gemini | codex | custom | shell (default: claude)
- `--title <name>` — Session title (default: auto-generated)
- `--command <cmd>` — Custom command (requires `--tool custom`)
- `--group <path>` — Group path (default: my-sessions)
- `--worktree` — Create in a git worktree
- `--branch <name>` — Worktree branch name (requires `--worktree`)
- `--base-develop` — Base worktree on develop branch
- `--resume` — Resume existing Claude session
- `--skip-permissions` — Skip Claude permission prompts

## List sessions

```bash
bn --list
bn --list --status running
bn --list --json
```

## Session actions

```bash
bn --stop <id-or-title>
bn --restart <id-or-title>
bn --attach <id-or-title>
bn --delete <id-or-title> --force
bn --delete <id-or-title> --worktree --force
```

## Send instructions to a running session

```bash
bn --send <id-or-title> Fix the snackbar so it appears above the bottom nav bar
```

Sends the message as input to the session's tmux pane (types it and presses Enter). Use this to give tasks to running Claude/agent sessions programmatically.

## Session info

```bash
bn --status <id-or-title>
bn --info <id-or-title>
bn --info <id-or-title> --json
```

Sessions can be referenced by full ID, title, or ID prefix. Changes made via CLI appear in any running TUI instance automatically.
