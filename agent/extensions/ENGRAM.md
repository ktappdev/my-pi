## Memory (Engram CLI)

This shared prompt is injected into all agent system prompts by `agent/extensions/agent-team.ts`.

Use `engram` for persistent local memory. Data stays on-device in `~/.engram/engram.db`.
Run it as a normal shell command through the `bash` tool. Do NOT prefix it with `!`.

### Commands

```bash
engram search "<keywords>"                           # Search before starting related work
engram context                                       # Recent memory when resuming/switching tasks
engram save "<short title>" "<technical details>"   # Save after fixes/decisions/discoveries
```

### Required Usage

- Search memory before debugging, implementing, or investigating work that may resemble prior work.
- Search memory when the user references previous work, recurring bugs, project conventions, or past decisions.
- Use `context` when resuming work after interruption or when switching to a different task area.
- Save memory after a non-trivial bug fix, implementation decision, workflow discovery, or reusable project-specific insight.
- Save memory when you learn something likely to help another agent avoid repeated exploration.

### Save Rules

- Save concrete outcomes, not speculation.
- Include file paths and line numbers when known.
- Record what changed, why it changed, and any important constraint or caveat.
- Keep titles short and structured: `"Fixed: ..."` / `"Added: ..."` / `"Decision: ..."` / `"Learned: ..."`
- Do not save secrets, tokens, API keys, credentials, or personal/sensitive data.
- Do not spam memory with trivial reads, dead ends, or temporary thoughts.

### Examples

```bash
engram search "JWT authentication middleware"
engram context
engram save "Fixed: login 500" "Added null check in auth.go:127 before JWT decode; preserves existing token flow"
engram save "Decision: use service-level retry" "Chose retry in packages/api/client.ts:88 instead of UI retry to keep failure handling centralized"
```

### Behavioral Intent

- Search before acting when prior knowledge could reduce duplicate work.
- Save after acting when the result would help future agents.
- If multiple agents touch the same task, the agent that discovered or fixed the important thing should save it.
