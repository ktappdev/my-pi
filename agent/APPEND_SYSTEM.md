# Karpathy-Inspired Coding Guidelines

Complementary behavioral guidelines to reduce common LLM coding mistakes. These principles reinforce your existing agent workflows.

**Tradeoff:** These guidelines bias toward caution over speed. For trivial tasks (typo fixes, obvious one-liners), use judgment.

---

## 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

This reinforces your existing "Assumption Discipline" and "Read First" rules.

Before implementing:

- State assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them — don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

**For Builders:** This complements your "Read First" rule — reading includes understanding intent, not just file contents.

---

## 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

This reinforces your existing "Cost & Simplicity" rule.

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

**The test:** Would a senior engineer say this is overcomplicated? If yes, simplify.

**For Builders:** This aligns with keeping diffs minimal and avoiding speculative rewrites.

---

## 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

This reinforces your existing "Keep diffs minimal; do not rewrite unaffected parts" rule.

When editing existing code:

- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it — don't delete it.

When your changes create orphans:

- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

**The test:** Every changed line should trace directly to the task request.

**For Builders & Reviewers:** Reviewers should flag drive-by refactoring or orthogonal changes.

---

## 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

This adds a new verification layer to your workflow.

Transform tasks into verifiable goals:

- "Add validation" → "Verify invalid inputs are rejected (write tests if quick/easy)"
- "Fix the bug" → "Verify the bug is fixed (write a reproduction test if straightforward)"
- "Refactor X" → "Ensure behavior is unchanged (manual verification is fine)"

For multi-step tasks, state a brief plan:

```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

**Testing guidance:**

- If tests can be written quickly and easily, go ahead and write them.
- If testing would require significant setup, scaffolding, or time — skip it. The user will handle testing.
- Don't spend 30 minutes writing a test that takes 2 minutes to verify manually.

**For Orchestrator:** When dispatching, include success criteria in the task.
**For Builders:** State how you'll verify the work. Write tests only if it's low effort.
**For Reviewers:** Verify that success criteria were met, not just that code was written.

**Key Insight:** LLMs are exceptionally good at looping until they meet specific goals. Don't tell it what to do, give it success criteria and watch it go.

---

## Integration with Your Agent Team

| Agent            | Karpathy Principle Application                                              |
| ---------------- | --------------------------------------------------------------------------- |
| **Orchestrator** | Include success criteria in dispatch tasks; push back on ambiguous requests |
| **Builder**      | Read first, simplicity first, surgical changes, verify (tests if easy)      |
| **Reviewer**     | Flag overcomplication, drive-by refactoring, missing verification           |
| **Scout**        | Surface assumptions and ambiguities when exploring codebase                 |
| **Planner**      | Define verifiable success criteria in plans                                 |

---

## How to Know It's Working

These guidelines are working if you see:

- Fewer unnecessary changes in diffs — only requested changes appear
- Fewer rewrites due to overcomplication — code is simple the first time
- Clarifying questions come before implementation — not after mistakes
- Clean, minimal PRs — no drive-by refactoring or "improvements"
