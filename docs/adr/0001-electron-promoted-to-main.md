---
number: 0001
title: Electron promoted to main; TUI archived
status: accepted
date: 2026-04-18
---

# 0001 — Electron promoted to main; TUI archived

## Context

Bastion began as a fork of [Frayo44/agent-view](https://github.com/Frayo44/agent-view),
a Bun + Solid.js + OpenTUI + tmux terminal UI for orchestrating AI coding
sessions. In parallel, an Electron rewrite (React + Zustand + xterm.js +
node-pty + better-sqlite3) was developed on `feature/electron-v1` in a
git worktree. After ~49 commits including a full UX overhaul (zoom mode,
pop-out windows, tile header redesign, sidebar improvements) and 238
passing tests, the Electron version was clearly the focus of active work.

Having two codebases on two branches — one the "official" main, one the
real work happening in a worktree — was creating cognitive overhead:
context switches between `bun` and `npm`, tmux vs real PTY mental models,
and a `main` branch that no longer reflected where the project was going.

## Decision

We will treat the Electron app as the canonical Bastion. Branch `main`
now points to the Electron HEAD (formerly `feature/electron-v1`). The TUI
is preserved on branch `legacy-tui` and tag `v0-tui-final` for history and
emergency resurrection. The `upstream` remote (agent-view) is removed —
we are no longer contributing upstream.

## Consequences

**Positive**

- Single canonical tree — no worktree, no branch toggling, no `bun` vs `npm` split.
- `main` reflects active work; `git log` on main tells the real story.
- Root `CLAUDE.md` now describes the Electron stack at repo checkout.
- CI becomes feasible (the old Bun-based workflows that shipped with the fork were never viable for the Electron build and have been removed).
- TUI history remains fully reachable via `legacy-tui` branch and `v0-tui-final` tag.

**Negative**

- Remote `main` was replaced via `--force-with-lease`. Anyone with an old
  local `main` clone will need to re-fetch. (Personal repo, no collaborators — low cost.)
- The agent-view upstream relationship is severed. Cherry-picking their fixes now requires re-adding the remote and doing it manually.
- The TUI's 9 security-hardening commits (UUID validation, SQL allowlist,
  0o700 dirs, signal-file relocation, etc.) were the work that went into v0.0.20. These patterns need to be re-verified as present in the Electron rewrite; some protections (shell injection avoidance, parameterized queries, 0o700 dirs) are already there but a deliberate sweep is worthwhile.

## Alternatives Considered

- **Keep both codebases alive in parallel** — rejected because it split focus, and
  the TUI had reached a shippable-but-not-shipped state (v0.0.20, never tagged)
  while every meaningful improvement was happening on the Electron side.
- **Merge `feature/electron-v1` into `main` as a single commit** — rejected because the TUI and Electron trees share essentially no files; the merge would have produced a giant noisy diff that erased the real granular commit history of the Electron work.
- **Start a fresh repo for the Electron app** — rejected because the issue tracker, release tags (v0.0.1–v0.0.19 from the agent-view era, plus v0.0.20 from TUI rebrand), and the GitHub repo identity were worth keeping. Branch rename + archive preserves everything.
- **Rebuild the TUI rather than rewrite in Electron** — not seriously considered this session; the rewrite decision was made earlier and the Electron work was already complete when this session started.
