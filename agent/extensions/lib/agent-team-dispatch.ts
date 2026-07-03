import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { Text } from "@mariozechner/pi-tui";
import { spawn } from "child_process";
import { existsSync, mkdirSync, unlinkSync, readFileSync } from "fs";
import { join, homedir } from "path";
import type { AgentTeamContext, AgentState, DispatchResult } from "./agent-team-types.js";
import {
	getProjectPiDir,
	displayName,
	mergeSystemPrompt,
} from "./agent-team-config.js";
import { findPiExecutable, getSubagentExtensionArgs } from "./agent-team-utils.js";
import { isStateless } from "./agent-team-stateless.js";
import { ensureGitignoreEntry } from "./agent-team-config.js";

export async function dispatchAgent(
	agentName: string,
	task: string,
	ctx: ExtensionContext,
	context: AgentTeamContext,
): Promise<DispatchResult> {
	// Strip Pi's "@" tag prefix from local file references so the model sees clean paths
	let sanitizedTask = task.replace(/@(?=(\/|\.\/|~\/))/g, "");
	// Inject contexting status for scout agent
	if (agentName.toLowerCase() === "scout" && context.contextingStatus !== "unavailable") {
		sanitizedTask = `Contexting: ${context.contextingStatus}\n${sanitizedTask}`;
	}
	const key = agentName.toLowerCase();
	const state = context.agentStates.get(key);
	if (!state) {
		return Promise.resolve({
			output: `Agent "${agentName}" not found. Available: ${Array.from(context.agentStates.values()).map(s => displayName(s.def.name)).join(", ")}`,
			exitCode: 1,
			elapsed: 0,
		});
	}

	if (state.status === "running") {
		return Promise.resolve({
			output: `Agent "${displayName(state.def.name)}" is already running. Wait for it to finish.`,
			exitCode: 1,
			elapsed: 0,
		});
	}

	state.status = "running";
	state.task = sanitizedTask;
	state.toolCount = 0;
	state.elapsed = 0;
	state.lastWork = [];
	state.runCount++;
	context.appendAgentLog(key, `[run] ${new Date().toLocaleTimeString()} — ${task}`);
	context.updateWidget();

	const startTime = Date.now();
	let isRunning = true;
	state.timer = setInterval(() => {
		if (isRunning) {
			state.elapsed = Date.now() - startTime;
			context.updateWidget();
		}
	}, 1000);

	// Use agent-specific model if assigned, otherwise use session default
	const ctxModel = ctx.model as any;
	const model = state.model || state.def.model || (ctxModel?.provider && ctxModel?.id
		? `${ctxModel.provider}/${ctxModel.id}`
		: "openrouter/google/gemini-3-flash-preview");

	// Session file for this agent
	const agentKey = state.def.name.toLowerCase().replace(/\s+/g, "-");
	const agentSessionFile = join(context.sessionDir, `${agentKey}.json`);

	// If stateless, delete any existing session so we start fresh
	if (isStateless(key)) {
		if (existsSync(agentSessionFile)) {
			unlinkSync(agentSessionFile);
		}
		state.sessionFile = null;
	}

	// Load global APPEND_SYSTEM.md for sub-agents (exclude certain agents)
	const globalAppendPath = join(homedir(), '.pi', 'agent', 'APPEND_SYSTEM.md');
	const globalAppendRaw = existsSync(globalAppendPath) ? readFileSync(globalAppendPath, 'utf-8').trim() : '';
	const excludedAgents = ['scout', 'tavily', 'documenter', 'designer', 'devops', 'sparky'];
	const shouldAppend = !excludedAgents.includes(state.def.name.toLowerCase());
	const globalAppend = shouldAppend ? globalAppendRaw : '';

	// Build args
	const args = [
		"--mode", "json",
		"-p",
		"--no-extensions",
		...getSubagentExtensionArgs(state.def.name, state.def.tools, state.def.loadProviders ?? true),
		"--model", model,
		"--thinking", state.thinking || state.def.thinking || "off",
		"--tools", state.def.tools,
		"--append-system-prompt", mergeSystemPrompt(state.def.systemPrompt + (globalAppend ? "\n\n" + globalAppend : "")),
		"--session", agentSessionFile,
	];

	if (state.sessionFile && existsSync(state.sessionFile)) {
		args.push("-c");
	}

	args.push(sanitizedTask);

	const textChunks: string[] = [];

	return new Promise((resolve) => {
		const proc = spawn(findPiExecutable(), args, {
			stdio: ["ignore", "pipe", "pipe"],
			env: { ...process.env },
			shell: false,
		});

		context.runningProcs.set(key, proc);

		let buffer = "";
		let liveTextBuffer = "";

		proc.stdout!.setEncoding("utf-8");
		proc.stdout!.on("data", (chunk: string) => {
			buffer += chunk;
			const lines = buffer.split("\n");
			buffer = lines.pop() || "";
			for (const line of lines) {
				if (!line.trim()) continue;
				try {
					const event = JSON.parse(line);
					if (event.type === "message_update") {
						const delta = event.assistantMessageEvent;
						if (delta?.type === "text_delta") {
							const deltaText = delta.delta || "";
							textChunks.push(deltaText);
							liveTextBuffer += deltaText;
							const completed = liveTextBuffer.split("\n");
							liveTextBuffer = completed.pop() || "";
							for (const completedLine of completed) {
								context.appendAgentLog(key, completedLine);

								const trimmed = completedLine.trim();
								if (trimmed && !trimmed.startsWith("[wait]")) {
									const lastIdx = state.lastWork.length - 1;
									if (lastIdx >= 0 && !state.lastWork[lastIdx].includes("\n")) {
										state.lastWork[lastIdx] = trimmed;
									} else {
										state.lastWork.push(trimmed);
									}
									if (state.lastWork.length > 10) state.lastWork.shift();
								}
							}
							context.updateWidget();
						}
					} else if (event.type === "tool_execution_start") {
						state.toolCount++;
						const toolName = event.toolCall?.name || event.toolName || "tool";
						const toolArgs = event.args || event.toolCall?.arguments;
						const summary = context.summarizeToolCall(toolName, toolArgs);
						context.appendAgentLog(key, summary);
						state.lastWork.push(summary);
						if (state.lastWork.length > 10) state.lastWork.shift();
						context.updateWidget();
					} else if (event.type === "message_end") {
						const msg = event.message;
						if (msg?.usage && context.contextWindow > 0) {
							state.contextPct = ((msg.usage.input || 0) / context.contextWindow) * 100;
							context.updateWidget();
						}
					} else if (event.type === "agent_end") {
						const msgs = event.messages || [];
						const last = [...msgs].reverse().find((m: any) => m.role === "assistant");
						if (last?.usage && context.contextWindow > 0) {
							state.contextPct = ((last.usage.input || 0) / context.contextWindow) * 100;
							context.updateWidget();
						}
						if (last?.stopReason === "error" || last?.errorMessage) {
							context.appendAgentLog(key, `[error] ${last.errorMessage || last.stopReason || "Unknown error"}`);
						}
					}
				} catch {}
			}
		});

		proc.stderr!.setEncoding("utf-8");
		proc.stderr!.on("data", (chunk: string) => {
			const lines = chunk.replace(/\r/g, "").split("\n");
			for (const line of lines) {
				if (line.trim()) {
					context.appendAgentLog(key, `[stderr] ${line.trim()}`);
				}
			}
		});

		proc.on("close", (code) => {
			context.runningProcs.delete(key);
			try {
				const event = JSON.parse(buffer);
				if (event.type === "message_update") {
					const delta = event.assistantMessageEvent;
					if (delta?.type === "text_delta") {
						const deltaText = delta.delta || "";
						textChunks.push(deltaText);
						liveTextBuffer += deltaText;
					}
				}
			} catch {}

			if (liveTextBuffer.trim()) {
				context.appendAgentLog(key, liveTextBuffer.trim());
			}

			clearInterval(state.timer);
			isRunning = false;
			state.elapsed = Date.now() - startTime;
			const isSuccess = code === 0;
			state.status = isSuccess ? "done" : "error";

			// Mark session file as available for resume (skip if stateless)
			if (isSuccess && !isStateless(key)) {
				state.sessionFile = agentSessionFile;
			} else if (isStateless(key)) {
				state.sessionFile = null;
				if (existsSync(agentSessionFile)) {
					unlinkSync(agentSessionFile);
				}
			}

			const full = textChunks.join("");
			const fullLines = full.split("\n").map(l => l.trim()).filter(Boolean);

			let output = full;
			if (!isSuccess) {
				const logs = context.agentLogs.get(key) || [];
				output = context.buildErrorOutput(
					code,
					fullLines,
					logs,
					model,
					state.thinking,
					state.def.thinking,
					state.def.tools,
				);
			}

			context.appendAgentLog(key, `[${isSuccess ? "done" : "error"}] exit=${code ?? 1} in ${Math.round(state.elapsed / 1000)}s`);
			const nonWaitFullLines = fullLines.filter(l => l.trim() && !l.trim().startsWith("[wait]"));
			if (nonWaitFullLines.length > 0) {
				state.lastWork = nonWaitFullLines.slice(-10);
			} else if (!isSuccess) {
				state.lastWork = ["Agent failed"];
			}

			if (fullLines.length > 0) {
				context.appendAgentLog(key, `[summary] ${fullLines[fullLines.length - 1]}`);
			}
			context.updateWidget();

			ctx.ui.notify(
				`${displayName(state.def.name)} ${state.status} in ${Math.round(state.elapsed / 1000)}s`,
				state.status === "done" ? "success" : "error"
			);

			resolve({
				output: output,
				exitCode: code ?? 1,
				elapsed: state.elapsed,
			});
		});

		proc.on("error", (err) => {
			context.runningProcs.delete(key);
			clearInterval(state.timer);
			isRunning = false;
			state.status = "error";
			const errorDetails = `Error spawning agent "${state.def.name}": ${err.message}\n\nThis may indicate:\n- The model is invalid or unavailable\n- The model doesn't support the requested thinking level\n- System resources are low\n\nAgent config:\n- Model: ${model}\n- Thinking: ${state.thinking || state.def.thinking || "off"}\n- Tools: ${state.def.tools}`;
			state.lastWork = errorDetails;
			context.appendAgentLog(key, `[error] ${err.message}`);
			context.appendAgentLog(key, `[hint] Check model availability with: pi --list-models`);
			context.updateWidget();
			resolve({
				output: errorDetails,
				exitCode: 1,
				elapsed: Date.now() - startTime,
			});
		});
	});
}

export function registerDispatchTools(pi: ExtensionAPI, context: AgentTeamContext): void {
	// Determine if this is the orchestrator (main session) or a sub-agent
	const args = process.argv;
	const toolsIdx = args.findIndex(arg => arg === '--tools');
	const isMainSession = toolsIdx === -1;

	let isOrchestrator = isMainSession;
	if (!isMainSession && toolsIdx + 1 < args.length) {
		const toolsList = args[toolsIdx + 1];
		isOrchestrator = toolsList.split(',').map((t: string) => t.trim()).includes('dispatch_agent');
	}

	// Only register dispatch_agent for orchestrator
	if (isOrchestrator) {
		pi.registerTool({
			name: "dispatch_agent",
			label: "Dispatch Agent",
			description: "Dispatch a task to a specialist agent. The agent will execute the task and return the result. Use the system prompt to see available agent names.",
			parameters: Type.Object({
				agent: Type.String({ description: "Agent name (case-insensitive)" }),
				task: Type.String({ description: "Task description for the agent to execute" }),
			}),

			async execute(_toolCallId, params, _signal, onUpdate, ctx) {
				try {
					const { agent, task } = params as { agent: string; task: string };

					if (onUpdate) {
						onUpdate({
							content: [{ type: "text", text: `Dispatching to ${agent}...` }],
							details: { agent, task, status: "dispatching" },
						});
					}

					const result = await dispatchAgent(agent, task, ctx, context);

					const truncated = result.output.length > 8000
						? result.output.slice(0, 8000) + "\n\n... [truncated]"
						: result.output;

					const status = result.exitCode === 0 ? "done" : "error";
					const summary = `[${agent}] ${status} in ${Math.round(result.elapsed / 1000)}s`;

					return {
						content: [{ type: "text", text: `${summary}\n\n${truncated}` }],
						details: {
							agent,
							task,
							status,
							elapsed: result.elapsed,
							exitCode: result.exitCode,
							fullOutput: result.output,
						},
					};
				} catch (err: any) {
					const { agent, task } = params as { agent: string; task: string };
					return {
						content: [{ type: "text", text: `Error dispatching to ${agent}: ${err?.message || err}` }],
						details: { agent, task, status: "error", elapsed: 0, exitCode: 1, fullOutput: "" },
					};
				}
			},

			renderCall(args, theme) {
				const agentName = (args as any).agent || "?";
				const task = (args as any).task || "";
				return new Text(
					theme.fg("toolTitle", theme.bold("dispatch_agent ")) +
					theme.fg("accent", agentName) +
					theme.fg("dim", " — ") +
					theme.fg("muted", task),
					0, 0,
				);
			},

			renderResult(result, options, theme) {
				const details = result.details as any;
				if (!details) {
					const text = result.content[0];
					return new Text(text?.type === "text" ? text.text : "", 0, 0);
				}

				if (options.isPartial || details.status === "dispatching") {
					return new Text(
						theme.fg("accent", `● ${details.agent || "?"}`) +
						theme.fg("dim", " working..."),
						0, 0,
					);
				}

				const icon = details.status === "done" ? "✓" : "✗";
				const color = details.status === "done" ? "success" : "error";
				const elapsed = typeof details.elapsed === "number" ? Math.round(details.elapsed / 1000) : 0;
				const header = theme.fg(color, `${icon} ${details.agent}`) +
					theme.fg("dim", ` ${elapsed}s`);

				if (details.status === "error") {
					const preview = details.fullOutput?.split("\n").slice(0, 12).join("\n") || "Unknown error";
					return new Text(header + "\n" + theme.fg("error", preview), 0, 0);
				}

				if (options.expanded && details.fullOutput) {
					const output = details.fullOutput.length > 4000
						? details.fullOutput.slice(0, 4000) + "\n... [truncated]"
						: details.fullOutput;
					return new Text(header + "\n" + theme.fg("muted", output), 0, 0);
				}

				return new Text(header, 0, 0);
			},
		});

		pi.registerTool({
			name: "parallel_scout",
			label: "Parallel Scout",
			description: "Dispatch independent exploration tasks to Scout Alfa and Scout Bravo in parallel. Both run concurrently. Use for 2+ independent codebase exploration tasks that can happen simultaneously.",
			parameters: Type.Object({
				tasks: Type.Array(Type.String({ description: "Exploration tasks. Each task goes to Scout Alfa or Scout Bravo round-robin." })),
			}),

			async execute(_toolCallId, params, _signal, onUpdate, ctx) {
				try {
					const { tasks } = params as { tasks: string[] };
					const scoutNames = ["scout-alfa", "scout-bravo"];

					if (onUpdate) {
						onUpdate({
							content: [{ type: "text", text: `parallel_scout: ${tasks.length} tasks across ${scoutNames.length} scouts...` }],
							details: { tasks, scoutNames, status: "dispatching" },
						});
					}

					const dispatches = tasks.map((task, i) => {
						const agent = scoutNames[i % scoutNames.length];
						return dispatchAgent(agent, task, ctx, context);
					});

					const results = await Promise.allSettled(dispatches);

					const combinedOutput = results.map((result, i) => {
						const task = tasks[i];
						const agent = scoutNames[i % scoutNames.length];
						if (result.status === "fulfilled") {
							const r = result.value;
							const truncated = r.output.length > 6000
								? r.output.slice(0, 6000) + "\n\n... [truncated]"
								: r.output;
							const meta = r.exitCode === 0
								? `${Math.round(r.elapsed / 1000)}s`
								: `ERR · ${Math.round(r.elapsed / 1000)}s`;
							return `## ${agent}: ${task.substring(0, 80)}\n${meta}\n\n${truncated}`;
						} else {
							return `## ${agent}: ${task.substring(0, 80)}\nFailed: ${result.reason?.message || result.reason}`;
						}
					}).join("\n\n---\n\n");

					const allOk = results.every(r => r.status === "fulfilled" && r.value.exitCode === 0);
					const totalElapsed = results
						.filter((r): r is PromiseFulfilledResult<DispatchResult> => r.status === "fulfilled")
						.reduce((sum, r) => sum + r.value.elapsed, 0);

					return {
						content: [{ type: "text", text: combinedOutput }],
						details: {
							tasks,
							scoutNames,
							status: allOk ? "done" : "error",
							elapsed: totalElapsed,
							fullOutput: combinedOutput,
						},
					};
				} catch (err: any) {
					return {
						content: [{ type: "text", text: `parallel_scout failed: ${err?.message || err}` }],
						details: { status: "error", elapsed: 0, fullOutput: "" },
					};
				}
			},

			renderCall(args, theme) {
				const tasks = (args as any).tasks || [];
				const count = Array.isArray(tasks) ? tasks.length : 0;
				return new Text(
					theme.fg("toolTitle", theme.bold("parallel_scout ")) +
					theme.fg("accent", `${count} tasks`) +
					theme.fg("dim", " — ") +
					theme.fg("muted", "alfa + bravo"),
					0, 0,
				);
			},

			renderResult(result, options, theme) {
				const details = result.details as any;
				if (!details) {
					const text = result.content[0];
					return new Text(text?.type === "text" ? text.text : "", 0, 0);
				}

				if (options.isPartial || details.status === "dispatching") {
					const count = details.tasks?.length || 0;
					return new Text(
						theme.fg("accent", `● parallel_scout`) +
						theme.fg("dim", ` ${count} tasks running...`),
						0, 0,
					);
				}

				const icon = details.status === "done" ? "✓" : "✗";
				const color = details.status === "done" ? "success" : "error";
				const elapsed = typeof details.elapsed === "number" ? Math.round(details.elapsed / 1000) : 0;
				const header = theme.fg(color, `${icon} parallel_scout`) +
					theme.fg("dim", ` ${elapsed}s · ${details.tasks?.length || 0} tasks`);

				if (options.expanded && details.fullOutput) {
					const output = details.fullOutput.length > 3000
						? details.fullOutput.slice(0, 3000) + "\n... [truncated]"
						: details.fullOutput;
					return new Text(header + "\n" + theme.fg("muted", output), 0, 0);
				}

				return new Text(header, 0, 0);
			},
		});

		pi.registerTool({
			name: "dispatch_background",
			label: "Dispatch Background",
			description: "Dispatch a task to a specialist agent to run in the background. The agent executes independently without blocking the orchestrator. Use for long-running tasks or parallel work.",
			parameters: Type.Object({
				agent: Type.String({ description: "Agent name (case-insensitive)" }),
				task: Type.String({ description: "Task description for the agent to execute" }),
			}),

			async execute(_toolCallId, params, _signal, onUpdate, ctx) {
				try {
					const { agent, task } = params as { agent: string; task: string };

					if (onUpdate) {
						onUpdate({
							content: [{ type: "text", text: `Dispatching ${agent} to background...` }],
							details: { agent, task, status: "dispatching" },
						});
					}

					const key = agent.toLowerCase();
					const state = context.agentStates.get(key);
					if (!state) {
						return {
							content: [{ type: "text", text: `Agent "${agent}" not found.` }],
							details: { status: "error" },
						};
					}

					if (state.status === "running") {
						return {
							content: [{ type: "text", text: `Agent "${displayName(state.def.name)}" is already running.` }],
							details: { status: "error" },
						};
					}

					// Launch in background without waiting
					dispatchAgent(agent, task, ctx, context).catch(() => {
						// Error handling is inside dispatchAgent
					});

					return {
						content: [{ type: "text", text: `Dispatched ${displayName(state.def.name)} to background. Use /agents-watch to monitor.` }],
						details: { agent, task, status: "dispatched" },
					};
				} catch (err: any) {
					return {
						content: [{ type: "text", text: `Error: ${err?.message || err}` }],
						details: { status: "error" },
					};
				}
			},

			renderCall(args, theme) {
				const agentName = (args as any).agent || "?";
				const task = (args as any).task || "";
				return new Text(
					theme.fg("toolTitle", theme.bold("dispatch_background ")) +
					theme.fg("accent", agentName) +
					theme.fg("dim", " — ") +
					theme.fg("muted", task),
					0, 0,
				);
			},

			renderResult(result, options, theme) {
				const details = result.details as any;
				if (!details) {
					const text = result.content[0];
					return new Text(text?.type === "text" ? text.text : "", 0, 0);
				}

				if (options.isPartial || details.status === "dispatching") {
					return new Text(
						theme.fg("accent", `● ${details.agent || "?"}`) +
						theme.fg("dim", " dispatching..."),
						0, 0,
					);
				}

				const icon = details.status === "dispatched" ? "⚡" : "✗";
				const color = details.status === "dispatched" ? "warning" : "error";
				const header = theme.fg(color, `${icon} ${details.agent}`) +
					theme.fg("dim", " background");

				if (options.expanded && details.fullOutput) {
					return new Text(header + "\n" + theme.fg("muted", details.fullOutput), 0, 0);
				}

				return new Text(header, 0, 0);
			},
		});
	}
}