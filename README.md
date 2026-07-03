# Orchestrator

Minimal multi-agent coding setup for Pi CLI. No fluff. Only code.

## How it works (10 seconds)

You talk to **Orchestrator**.
Orchestrator delegates all work to specialist agents.
Specialists do actual work. Orchestrator reports back short.

Orchestrator runs the `pi-caveman` extension: removes all pleasantries, filler, hedging. Only facts, only actions.

## What this is

- User-level Pi configuration stored in `~/.pi`
- Minimal orchestrator (`orchestrator`) + specialist agents in `agent/agents/`
- Custom extensions in `agent/extensions/` for safety, workflow, quality of life

## Prerequisites

- Base Pi coding agent installed and working on your machine
- macOS/Linux shell access (examples use `bash`/`zsh`)
- At least one model provider API key

## 1) Install the base Pi coding agent

Orchestrator builds on top of the Pi coding agent:

- Repo: `https://github.com/badlogic/pi-mono/tree/main/packages/coding-agent`

Install globally:

```bash
npm install -g @mariozechner/pi-coding-agent
```

## 2) Install Orchestrator config

```bash
git clone https://github.com/ktappdev/.pi.git ~/.pi
```

Existing config? Backup first:
```bash
mv ~/.pi ~/.pi.backup.$(date +%Y%m%d-%H%M%S)
git clone https://github.com/ktappdev/.pi.git ~/.pi
```

## 3) Install extension dependencies

Extensions live in `~/.pi/agent/extensions`:

```bash
cd ~/.pi/agent/extensions
npm install
```

## 4) Set environment variables

Add keys to `~/.zshrc`:

```bash
# Orchestrator / Pi keys
export QWEN_API_KEY="your_qwen_api_key"
export TAVILY_API_KEY="your_tavily_api_key"
```

Apply: `source ~/.zshrc`

### Required
```bash
export QWEN_API_KEY="your_qwen_api_key"
```

### Highly recommended

```bash
export TAVILY_API_KEY="your_tavily_api_key"
```

Tavily powers external web research for docs, APIs, and current info.

### Optional provider keys

Set these only if you plan to use the corresponding providers in `agent/models.json`:

```bash
export BYTEDANCE_API_KEY="your_bytedance_key"
export INCEPTION_API_KEY="your_inception_key"
export DEEPSEEK_API_KEY="your_deepseek_key"
export QWEN_CLI_API_KEY="your_qwen_cli_key"
```

## 5) Start Pi (command is `pi`)

Run the CLI with `pi` (not `kyrie`).

Then work normally, for example:

```text
Refactor this service and run tests.
```

## Agent map

- `orchestrator`: orchestrator (you talk to this one)
- `scout`: find things in code
- `planner`: write implementation plans
- `builder`: write code
- `reviewer`: verify changes
- `designer`: UI specs
- `devops`: git / ci / tasks
- `tavily`: web research
- `sparky`: brainstorm
- `documenter`: write docs

## Verify your setup

Verify:

- `echo $QWEN_API_KEY` works
- Pi starts without errors
- Orchestrator dispatches agents correctly

## Security notes

- Never commit secrets to git (`agent/auth.json`, API keys, tokens)
- Keep credentials in environment variables or Pi login storage
- Rotate keys immediately if they are exposed

## Customize later

- Default provider/model: `agent/settings.json`
- Provider definitions and API key env names: `agent/models.json`
- Agent behavior prompts: `agent/agents/*.md`
- Team groupings: `agent/agents/teams.yaml`
