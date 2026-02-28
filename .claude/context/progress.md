# Task State

## In Progress
- Shell injection fix PR — code complete, needs move to 02-Personal and PR submission

## Next Up
1. Clone/move repo to `~/Projects/02-Personal/agent-view`
2. Verify git email is `tomstetson@users.noreply.github.com`
3. Verify remote `origin` points to `github.com/tomstetson/agent-view` (the fork)
4. Verify remote `upstream` points to `github.com/Frayo44/agent-view`
5. Push branch `fix/shell-injection-safety` to origin
6. Create PR against `upstream/main` — see PR template below
7. Smoke test: `bun run typecheck && bun test && bun run build`

## PR Details

**Title:** fix: prevent shell injection in subprocess calls

**Body:**
## Summary
- Replace shell-interpolated subprocess calls with argument arrays across 4 files
- Fix curl-pipe-bash auto-updater to download tagged release binaries directly
- Fix quoting bug in removeWorktree and unquoted branch in branchExists

## Files Changed
- src/core/tmux.ts — execTmux helper, 14 calls converted, tmuxCmd removed
- src/core/git.ts — execGit helper with cwd, 13 calls converted, quoting bugs fixed
- src/tui/component/dialog-new.tsx — commandExists uses execFileAsync
- src/core/updater.ts — Direct binary download from tagged release, no shell
- src/core/shell-safety.test.ts — New metacharacter safety tests
- src/core/tmux.test.ts — Extended with metacharacter test cases

## Test plan
- [x] bun run typecheck passes
- [x] bun test passes (167 tests, 0 failures)
- [x] bun run build succeeds
- [ ] Manual: create session with spaces in path
- [ ] Manual: create session with special chars in title

## Branch
fix/shell-injection-safety — 5 commits on top of main
