---
name: land-the-plane
description: End-of-session wrap-up protocol — commit/push changes, file issue beads for remaining work, run project quality gates, clean git state, and generate a next-session handoff prompt. Use when user says "land the plane", "wrap up", "end session", or clearly signals session shutdown.
---

# Land the Plane

Execute this protocol when the user signals session end. Steps are sequential — stop and report any failure before continuing.

## 0. Review Check

Before anything else, verify all changes this session have been reviewed:

- Check if there are uncommitted changes (`git status --short`) or recent commits that haven't been reviewed by the reviewer role.
- If any changes exist that the reviewer hasn't signed off on, **stop here and invoke the reviewer** to review them.
  - Pass the diff or summary of changes to the reviewer.
  - Wait for reviewer sign-off or requested changes before proceeding.
- If all changes are already reviewed (or there are none), proceed to step 1.

> Rationale: Prevents landing unreviewed work. Catches issues before commit/push.

## 1. Inventory Remaining Work

- Scan current state: open buffers, modified files, running processes, active `bd` issues.
- For any task started but not finished:
  - Create a `bd` bead: `bd create "Short description" -t task -p <priority>`
  - Include context from what was discussed/done so far.
- List all created beads at the end.

## 2. Run Quality Gates (Adaptive)

Detect project type from files in working directory:

| Indicator | Check |
|-----------|-------|
| `tsconfig.json` | `npx tsc --no-emit` |
| `.eslintrc*` or `eslintConfig` in `package.json` | `npm run lint` or `npx eslint .` |
| `go.mod` | `go test ./...` |
| `Cargo.toml` | `cargo test` |
| `Makefile` with `test` target | `make test` |
| `pyproject.toml` | `pytest` or `uv run pytest` |

**Rules:**
- If no indicators found, skip quality gates entirely.
- If a check fails, file a P0 issue bead: `bd create "Fix [check name] failure" -t task -p 0`
- Report pass/fail for each gate run.

## 3. Sync Issue Tracker

- `bd list` to show open issues — note any that are now complete.
  - Close finished ones: `bd close <id>` with a closing comment.
- Pull remote if `bd` has a sync mechanism (check `bd sync` or similar).

## 4. Clean Git State

```bash
cd <project-root>
git stash clear
git remote prune origin
```

- If there's a remote, check for stale local branches: `git branch -vv | grep ': gone]'` and offer to delete.

## 5. Verify Clean State

- `git status --short` — should be clean (no modified/untracked).
- `git log --oneline @{u}..HEAD` — check for unpushed commits. Push if any.
- If not clean, report what remains and ask user before taking action.

## 6. Generate Next-Session Handoff

Provide a copy-paste ready prompt for the user to start the next session:

> Continue work on: [Issue title or summary]. [1-2 sentence context: what was done, what the immediate next step is.]

If `bd` beads were created, reference them by ID.

## Output Format

Present results clearly:

```
✈️ LAND THE PLANE

1. Remaining Work
   • Created bead B-42: "Fix race condition in sync" (P2)

2. Quality Gates
   ✓ npx tsc --no-emit (passed)
   ✓ npm run lint (passed)
   - Skipped tests (no test framework detected)

3. Issue Tracker
   ✓ Closed B-38: "Add auth middleware"

4. Git Cleanup
   ✓ git stash clear
   ✓ git remote prune origin

5. Clean State
   ✓ Working tree clean, all changes pushed

6. Handoff Prompt
   > Continue work on: Sync Race Condition (B-42).
   > Auth middleware is merged. Next step: fix data race in sync worker.
```

---

## Manual Invocation

If the agent doesn't auto-trigger, user can always run `/skill:land-the-plane`.
