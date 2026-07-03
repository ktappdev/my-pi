---
name: fromai
description: While implementing code, when you encounter a self-contained function, bug fix, or refactor (15-60 min, scoped to one file), offload it as a real-code task for the human to write. Use when you spot isolated work inside a larger change — a single function, a validation block, a parsing routine. Do NOT use for vague epics, secrets, or pure questions.
---

# fromai/fai — AI Agent Skill

**fromai** is a coding task manager where AI agents assign coding/practice tasks to humans. The `fai` CLI is the agent's interface to create tasks, track progress, and grade submissions.

## Purpose

Use `fai` to keep the human in the loop with real-world code tasks, scoped to meaningful parts of the project:
- Functions or small blocks that need implementation
- Bug fixes where the human should practice the pattern
- Refactors or improvements to review and learn from
- Any real code work that benefits from human practice or oversight

The agent works on the actual project and sends small, scoped tasks for the human to write or review. These are real functions, fixes, and patterns from the codebase — not abstract puzzles. Tasks can be simple; the goal is practice and engagement with real code, not just "hard problems."

Example: AI is editing a QR code generator, encounters a loop function for bitmap colors, and sends just that function as a task for the human to write. Small, scoped, real-world code.

**Do not use** for:
- Secrets, credentials, or sensitive data
- Destructive production actions
- Vague or open-ended tasks ("improve performance")
- Huge multi-day projects
- Pure explanation questions (no code required)

**Do not construct frontend URLs. Use `fai` commands as source of truth.**

## Async Default Behavior

**Default workflow is async.** Create the task, report the task ID and summary to the user, then continue your original work.

```bash
# Create task and continue (requires jq for JSON parsing)
TASK_ID=$(fai task create --title "Sort Array" --starter-code "// TODO" --language typescript --json | jq -r '.id')
echo "Created task: $TASK_ID - Sort Array in TypeScript"
echo "View details: fai task get $TASK_ID"
# Continue with other work...
```

**Without jq** (manual ID extraction):
```bash
fai task create --title "Sort Array" --starter-code "// TODO" --language typescript
# Note the ID from output and report it to user
```

**Only wait/poll if the user explicitly asks you to.** Use `fai task poll <id>` for blocking waits:
```bash
fai task poll <id> --interval 10s --timeout 5m
```

## Creating High-Quality Tasks

**Context is mandatory.** Every task must include rich context in `--description` so the human understands:
- Where the work should happen
- Why it matters
- What specifically needs to change
- How to verify success

**Required context fields:**
- **File path** — which file contains the issue / where work should happen
- **File purpose** — what the file does, why it matters in the project
- **Problem statement** — what's broken, missing, or needs change
- **Property** — the specific property/behavior to fix/add
- **Constraints** — any technical constraints or edge cases
- **Success criteria** — how to know the fix works
- **Available tools** — list functions, APIs, or methods the human can use (with signatures and return values)

```bash
fai task create \
  --title "Fix JWT token parsing in auth middleware" \
  --description "File: backend/middleware/auth.go
Purpose: Validates JWT tokens on protected routes
Problem: Token parsing fails when token lacks 'Bearer ' prefix
Property: Should accept raw token (no prefix) per PocketBase v0.39 spec
Constraints: Must maintain backward compatibility, no breaking changes
Success: Requests with raw token in Authorization header pass validation

Available tools:
- pb.getAuthToken(): string — Returns raw JWT token from localStorage (no 'Bearer ' prefix)
- pb.getMe(): Promise<Record> — Fetches current authenticated user from PocketBase" \
  --starter-code "// Middleware code to fix" \
  --language go
```

Good tasks are also:
- **Specific**: Clear, testable objective
- **Scoped**: Completable in 15-60 minutes
- **Self-contained**: No external dependencies beyond standard libraries
- **Well-started**: Provide useful starter code or clear description

## Task Difficulty

**The agent determines difficulty — not the user.** No CLI flag needed. Adjust task complexity through description detail, starter code scope, and problem constraints.

### Checking User Level

Before creating a task, check the user's history:

```bash
fai task list --json
```

Count completed tasks and scan recent grades.

### Difficulty Scale

**Start easy. Ramp up only when the user proves ready.**

| Completed Tasks | Difficulty |
|-----------------|------------|
| 0-2 | easy |
| 3-9, no recent fails | medium |
| 10+, strong history | hard |

**Drop on failure:** If last 2 tasks graded D or F, drop one level. If already at easy, keep easy but reduce scope (smaller function, clearer signature, more hints in starter code).

### Task Design by Level

**Easy:**
- Single function with clear signature
- Well-defined input/output
- Under 30 lines expected
- No external dependencies
- Starter code provides function shell or clear template

**Medium:**
- Multiple functions or a small class
- Some design decisions required
- Error handling expected
- 30-80 lines expected
- Starter code gives entry point but leaves design open

**Hard:**
- Multi-file or architectural scope
- Multiple edge cases to handle
- Performance or memory considerations
- 80+ lines expected
- Starter code is minimal — describes interface but leaves implementation entirely open

## Starter Code Scope Rule

**Send the entire relevant block, not a cherry-picked snippet.** The human can only see what you give them. If you send one link and the task says "all links," they'll do one link.

Rules:
- **Template/HTML area**: Send the full template block (all sibling elements, the whole `<div>` or section). In Svelte, send the entire `{#if}`/`{#each}` block or the full template section between `<script>` and `<style>`.
- **Function scope**: Send the full function, not just the line that needs changing. Include surrounding functions if they provide context.
- **Multiple items**: If the task touches multiple similar elements (all sidebar links, all error messages, all button variants), send ALL of them. Don't send one and expect the human to guess the rest.
- **Whole file if needed**: If the file is under 300 lines, just send the whole thing. The human needs to understand structure to make good changes.

**Test your starter code**: Before submitting, ask: "If I only saw this starter code, would I know every line that needs to change?" If no, expand it.

Use `--language` for syntax highlighting (typescript, javascript, python, go, etc.).

## Accepted Submission Types

Both are valid submissions:

1. **Executable code**: Full implementation that runs
2. **Pseudo-code/plain-English**: Algorithmic description without syntax

Pseudo-code is acceptable when the goal is understanding approach, not implementation details. Grade accordingly (see rubrics below).

## User-Triggered Grading Workflow

Grading is user-triggered. When the user says something like "grade my fromai tasks" or "grade task <id>":

1. List tasks to find completed/ungraded ones:
   ```bash
   fai task list --json
   ```
   (Optional: pipe to `jq` to filter for ungraded tasks)
2. For each task with status `completed` and empty grade (`grade == ""`):
   ```bash
   fai task get <id> --json
   ```
3. Review the submission (code or pseudo-code). Always run a diff first:
   ```bash
   diff <(fai task get <id> --json | jq -r '.starter_code') <(fai task get <id> --json | jq -r '.code')
   ```
   This shows exactly what changed. Never rely on equality checks alone — even a single comment is a meaningful change.
4. Grade using the appropriate rubric (below)
5. Submit grade:
   ```bash
   fai task grade <id> --grade "A" --feedback "Correct approach, clean code"
   ```

## Grading Rubrics

### Code Submissions

| Grade | Criteria |
|-------|----------|
| A | Correct, efficient, idiomatic, well-structured |
| B | Correct but minor issues (style, minor inefficiency) |
| C | Works but significant issues (inefficient, unclear) |
| D | Partially correct or major bugs |
| F | Incorrect or does not compile/run |

### Pseudo-Code Submissions

Since pseudo-code lacks syntax, grade on **algorithmic understanding**. Do not penalize for syntax errors unless the task explicitly required executable code:

| Grade | Criteria |
|-------|----------|
| A | Correct algorithm, clear logic, handles edge cases |
| B | Correct approach but minor logical gaps or unclear steps |
| C | Generally correct but misses key cases or has logical flaws |
| D | Partially correct or shows misunderstanding |
| F | Incorrect approach or missing core concept |

### Feedback Requirements

**For D or F grades:** Include the solution or correct approach in the feedback. Explain why the solution is correct so the human can learn what they missed.

**For A/B/C grades:** Focus on strengths and improvements only — no need to provide the solution.

Example (D/F grade feedback):
```
Your approach has a critical bug: you're modifying the array while iterating,
which causes skipped elements. Here's the correct approach:

function sort(arr) {
  return arr.slice().sort((a, b) => a - b);
}

This creates a copy first, avoiding the mutation issue. The built-in sort
is O(n log n) and handles all edge cases.
```

**Always provide specific feedback** on what was done well and what to improve.

## Archiving and Cleanup

Archive completed/inactive tasks:
```bash
fai task delete <id>  # archives by default
```

Hard delete only for mistakes or sensitive content:
```bash
fai task delete <id> --hard
```

## Command Reference

```bash
fai task create --title "<title>" --starter-code "<code>" --language <lang> [--description "<desc>"]
fai task list                          # list all tasks
fai task get <id>                      # get task details
fai task update <id> --code "<code>"   # update starter code
fai task submit <id>                   # mark as completed (human action; DO NOT use unless explicitly instructed or simulating human)
fai task grade <id> --grade "<A-F>" --feedback "<text>"
fai task delete <id>                   # archive
fai task delete <id> --hard            # permanent delete
fai task poll <id>                     # block until status changes (only if user explicitly asks to wait)
fai task poll <id> --interval 10s --timeout 5m
```

All commands accept `--json` for machine-readable output.

## Auth

Two mechanisms:
- **API key** (recommended): Stored via `fai init --key`, sent as `X-API-Key` header
- **JWT token**: `--token` flag or `FROMAI_TOKEN` env var, sent as `Authorization` header

API keys don't expire. JWT tokens expire after 120h. Get/regenerate keys from the settings page.