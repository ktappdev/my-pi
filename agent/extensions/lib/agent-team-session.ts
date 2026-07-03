import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { Text } from "@mariozechner/pi-tui";
import { existsSync, mkdirSync, unlinkSync } from "fs";
import { join } from "path";
import type { AgentTeamContext, AgentState, DispatchResult, MAX_AGENT_LOG_LINES } from "./agent-team-types.js";
import {
	getProjectBaseDir,
	getProjectPiDir,
	scanAgentDirs,
	getGlobalTeamsPath,
	getProjectTeamsPath,
	readTeamsFile,
	mergeTeams,
	getGlobalAgentModelsPath,
	getProjectAgentModelsPath,
	readAgentYamlMap,
	mergeStringMaps,
	getGlobalAgentThinkingPath,
	getProjectAgentThinkingPath,
	displayName,
} from "./agent-team-config.js";
import {
	renderGridView,
	renderTableView,
	renderTacticalView,
} from "./agent-team-views.js";
import {
	createFooterMetricsState,
	recordFooterDelta,
	resetFooterMetrics,
	completeFooterMetrics,
} from "./agent-team-footer-metrics.js";
import {
	isStateless,
	loadStatelessConfig,
	getStatelessMode,
	listStateless,
} from "./agent-team-stateless.js";
import { detectContexting } from "./agent-team-utils.js";

export function createContext(cwd: string): AgentTeamContext {
	const agentStates: Map<string, AgentState> = new Map();
	const agentLogs: Map<string, string[]> = new Map();
	const runningProcs: Map<string, ReturnType<typeof import("child_process").spawn>> = new Map();
	let footerTui: any | null = null;
	let allAgentDefs: any[] = [];
	let globalTeams: Record<string, string[]> = {};
	let projectTeams: Record<string, string[]> = {};
	let teams: Record<string, string[]> = {};
	let globalAgentModels: Record<string, string> = {};
	let projectAgentModels: Record<string, string> = {};
	let agentModels: Record<string, string> = {};
	let globalAgentThinking: Record<string, string> = {};
	let projectAgentThinking: Record<string, string> = {};
	let agentThinking: Record<string, string> = {};
	let activeTeamName = "";
	let gridCols = 2;
	let viewMode: any = "grid";
	let watchAgentKey: string | null = null;
	let widgetCtx: any;
	let orchestratorTools: string[] = ["dispatch_agent", "read", "bash"];
	let sessionDir = "";
	let globalStatelessPath = "";
	let projectStatelessPath = "";
	let contextWindow = 0;
	const footerMetrics = createFooterMetricsState();
	const contextingStatus = detectContexting(cwd);

	function appendAgentLog(agentKey: string, line: string): void {
		const cleaned = line.replace(/\r/g, "");
		if (!cleaned.trim()) return;
		const lines = agentLogs.get(agentKey) ?? [];
		lines.push(cleaned);
		if (lines.length > MAX_AGENT_LOG_LINES) {
			lines.splice(0, lines.length - MAX_AGENT_LOG_LINES);
		}
		agentLogs.set(agentKey, lines);
	}

	function resolveAgentByInput(inputRaw: string): AgentState | null {
		const input = inputRaw.trim().toLowerCase();
		if (!input) return null;

		for (const state of agentStates.values()) {
			const rawName = state.def.name.toLowerCase();
			const display = displayName(state.def.name).toLowerCase();
			const slug = rawName.replace(/\s+/g, "-");
			if (input === rawName || input === display || input === slug) {
				return state;
			}
		}

		for (const state of agentStates.values()) {
			const rawName = state.def.name.toLowerCase();
			const display = displayName(state.def.name).toLowerCase();
			const slug = rawName.replace(/\s+/g, "-");
			if (rawName.includes(input) || display.includes(input) || slug.includes(input)) {
				return state;
			}
		}

		return null;
	}

	function buildErrorOutput(
		code: number,
		fullLines: string[],
		logs: string[],
		model: string,
		thinking: string | undefined,
		defThinking: string | undefined,
		tools: string,
	): string {
		const errorLines = fullLines.slice(-15).join("\n");
		const stderrLines = logs.filter(l => l.startsWith("[stderr]")).slice(-10);
		const errorEventLines = logs.filter(l => l.startsWith("[error]")).slice(-5);

		let output = `❌ Agent failed with exit code ${code}\n\n`;
		if (errorEventLines.length > 0) {
			output += `🔴 LLM Error:\n${errorEventLines.join("\n")}\n\n`;
		}
		if (stderrLines.length > 0) {
			output += `🟠 Stderr Output:\n${stderrLines.map(l => l.replace("[stderr] ", "")).join("\n")}\n\n`;
		}
		output += `⚪ Last Output:\n${errorLines}\n\n`;
		output += `📋 Agent Config:\n  Model: ${model}\n  Thinking: ${thinking || defThinking || "off"}\n  Tools: ${tools}`;
		return output;
	}

	function summarizeToolCall(toolName: string, toolArgs: any): string {
		if (!toolArgs || typeof toolArgs !== "object" || Object.keys(toolArgs).length === 0) {
			return `[${toolName}]`;
		}

		const keyParams: Record<string, string[]> = {
			read: ["path"],
			write: ["path"],
			edit: ["path"],
			bash: ["command"],
			grep: ["pattern"],
			find: ["path", "dir"],
			ls: ["path", "dir"],
			code_search: ["query"],
			web_search: ["query", "queries"],
			fetch_content: ["url", "urls"],
			dispatch_agent: ["agent"],
		};

		const preferred = keyParams[toolName] || ["path", "query", "command", "url", "pattern"];

		for (const key of preferred) {
			const val = toolArgs[key];
			if (val === undefined || val === null) continue;
			let s: string;
			if (typeof val === "string") {
				s = val;
			} else if (Array.isArray(val) && val.length > 0 && typeof val[0] === "string") {
				s = val.slice(0, 2).join(", ") + (val.length > 2 ? ` +${val.length - 2}` : "");
			} else {
				s = JSON.stringify(val);
			}
			s = s.replace(/[\n\r\t]+/g, " ").replace(/\s{2,}/g, " ").trim();
			if (s.length > 80) s = s.slice(0, 77) + "...";
			return `[${toolName}] ${s}`;
		}

		return `[${toolName}]`;
	}

	function loadAgents(cwd: string): void {
		const projectRoot = getProjectBaseDir(cwd);
		sessionDir = join(getProjectPiDir(cwd), "agent-sessions");
		if (!existsSync(sessionDir)) {
			mkdirSync(sessionDir, { recursive: true });
		}

		// Load all agent definitions
		allAgentDefs = scanAgentDirs(cwd);

		const globalTeamsPath = getGlobalTeamsPath();
		const projectTeamsPath = getProjectTeamsPath(cwd);
		globalTeams = existsSync(globalTeamsPath)
			? readTeamsFile(globalTeamsPath)
			: {};
		projectTeams = existsSync(projectTeamsPath)
			? readTeamsFile(projectTeamsPath)
			: {};
		teams = mergeTeams(globalTeams, projectTeams);

		// If no teams defined, create a default "all" team
		if (Object.keys(teams).length === 0) {
			teams = { all: allAgentDefs.map((d: any) => d.name) };
		}

		const globalModelsPath = getGlobalAgentModelsPath();
		const projectModelsPath = getProjectAgentModelsPath(cwd);
		globalAgentModels = existsSync(globalModelsPath)
			? readAgentYamlMap(globalModelsPath)
			: {};
		projectAgentModels = existsSync(projectModelsPath)
			? readAgentYamlMap(projectModelsPath)
			: {};
		agentModels = mergeStringMaps(globalAgentModels, projectAgentModels);

		const globalThinkingPath = getGlobalAgentThinkingPath();
		const projectThinkingPath = getProjectAgentThinkingPath(cwd);
		globalAgentThinking = existsSync(globalThinkingPath)
			? readAgentYamlMap(globalThinkingPath)
			: {};
		projectAgentThinking = existsSync(projectThinkingPath)
			? readAgentYamlMap(projectThinkingPath)
			: {};
		agentThinking = mergeStringMaps(globalAgentThinking, projectAgentThinking);

		// Load stateless config (global + project)
		globalStatelessPath = getGlobalAgentStatelessPath();
		projectStatelessPath = getProjectAgentStatelessPath(cwd);
		loadStatelessConfig(globalStatelessPath, projectStatelessPath);
	}

	function activateTeam(teamName: string): void {
		activeTeamName = teamName;
		const members = teams[teamName] || [];
		const defsByName = new Map(allAgentDefs.map((d: any) => [d.name.toLowerCase(), d]));

		agentStates.clear();
		for (const member of members) {
			if (member.toLowerCase() === "caveman") continue;
			const def = defsByName.get(member.toLowerCase());
			if (!def) continue;
			const key = def.name.toLowerCase().replace(/\s+/g, "-");
			const sessionFile = join(sessionDir, `${key}.json`);
			const assignedModel = agentModels[def.name.toLowerCase()];
			const assignedThinking = agentThinking[def.name.toLowerCase()];
			if (!agentLogs.has(def.name.toLowerCase())) {
				agentLogs.set(def.name.toLowerCase(), []);
			}
			agentStates.set(def.name.toLowerCase(), {
				def,
				status: "idle",
				task: "",
				toolCount: 0,
				elapsed: 0,
				lastWork: [],
				contextPct: 0,
				sessionFile: existsSync(sessionFile) ? sessionFile : null,
				runCount: 0,
				model: assignedModel,
				thinking: assignedThinking,
			});
		}

		// Auto-size grid columns based on team size
		const size = agentStates.size;
		gridCols = size <= 3 ? size : size === 4 ? 2 : 3;

		if (watchAgentKey && !agentStates.has(watchAgentKey)) {
			watchAgentKey = null;
		}
	}

	function updateStatelessWidget(): void {
		if (!widgetCtx) return;

		const globalMode = getStatelessMode();
		const allStateless = listStateless();

		// Filter to only agents in current team
		const teamKeys = new Set(Array.from(agentStates.keys()));
		const teamStateless = allStateless.filter((k: string) => teamKeys.has(k));

		if (!globalMode && teamStateless.length === 0) {
			widgetCtx.ui.setWidget("agent-team-stateless", undefined);
			return;
		}

		widgetCtx.ui.setWidget("agent-team-stateless", (_tui: any, theme: any) => {
			return {
				render(_width: number): string[] {
					if (globalMode) {
						return [theme.fg("warning", "⚡ all agents stateless")];
					}
					const names = teamStateless.map((a: string) => displayName(a)).join(", ");
					return [theme.fg("warning", `⚡ stateless: ${names}`)];
				},
				invalidate() {},
			};
		});
	}

	function updateWidget(): void {
		if (!widgetCtx) return;

		widgetCtx.ui.setWidget("agent-team", (_tui: any, theme: any) => {
			const text = new Text("", 0, 1);

			return {
				render(width: number): string[] {
					if (agentStates.size === 0) {
						text.setText(theme.fg("dim", "No agents found. Add .md files to agents/"));
						return text.render(width);
					}

					if (watchAgentKey) {
						const watchState = agentStates.get(watchAgentKey);
						if (!watchState) {
							// Watched agent was removed or reset - notify user and return to team view
							watchAgentKey = null;
							text.setText(theme.fg("warning", "⚠ Watched agent no longer exists. Returning to team view."));
							return text.render(width);
						} else {
							const title = theme.fg("accent", theme.bold(`Watching ${displayName(watchState.def.name)}`));
							const statusColor = watchState.status === "running"
								? "accent"
								: watchState.status === "done"
									? "success"
									: watchState.status === "error"
										? "error"
										: "dim";
							const meta = theme.fg("dim", "  status: ") +
								theme.fg(statusColor, watchState.status) +
								theme.fg("dim", ` · ${Math.round(watchState.elapsed / 1000)}s · tools ${watchState.toolCount}`);
							const hint = theme.fg("muted", "/agents-watch-off to return to team view");

							const lines = agentLogs.get(watchState.def.name.toLowerCase()) ?? [];
							const bodyHeight = Math.max(4, 50);
							const tail = lines.slice(-bodyHeight);
							const body = tail.length > 0
								? tail.map((line: string) => theme.fg("muted", line))
								: [theme.fg("dim", "No output yet. Dispatch a task to this agent.")];

							text.setText([title, meta, hint, "", ...body].join("\n"));
							return text.render(width);
						}
					}

					const agents = Array.from(agentStates.values());
					if (viewMode === "table") {
						text.setText(renderTableView(agents, width, theme));
						return text.render(width);
					}
					if (viewMode === "tactical") {
						text.setText(renderTacticalView(agents, width, theme));
						return text.render(width);
					}

					text.setText(renderGridView(agents, width, theme, gridCols));
					return text.render(width);
				},
				invalidate() {
					text.invalidate();
				},
			};
		});
	}

	return {
		agentStates,
		agentLogs,
		runningProcs,
		allAgentDefs,
		globalTeams,
		projectTeams,
		teams,
		globalAgentModels,
		projectAgentModels,
		agentModels,
		globalAgentThinking,
		projectAgentThinking,
		agentThinking,
		activeTeamName,
		gridCols,
		viewMode,
		watchAgentKey,
		widgetCtx,
		orchestratorTools,
		sessionDir,
		globalStatelessPath,
		projectStatelessPath,
		contextWindow,
		footerMetrics,
		contextingStatus,
		cwd,
		updateWidget,
		updateStatelessWidget,
		loadAgents,
		activateTeam,
		appendAgentLog,
		resolveAgentByInput,
		buildErrorOutput,
		summarizeToolCall,
	};
}

export function registerSessionHandlers(pi: ExtensionAPI, ctx: AgentTeamContext): void {
	// Ensure sub-agents are terminated when Pi exits
	pi.on("before_exit", async () => {
		for (const [key, proc] of ctx.runningProcs.entries()) {
			try {
				proc.kill("SIGKILL");
			} catch {}
			ctx.runningProcs.delete(key);
		}
	});

	// Handle Ctrl+C (SIGINT) - stop all running agents but keep Pi session alive
	process.on("SIGINT", () => {
		const stoppedAgents: string[] = [];

		// Stop ALL running agents, not just the first one
		for (const [key, proc] of ctx.runningProcs.entries()) {
			const state = ctx.agentStates.get(key);
			if (state && state.status === "running") {
				// Kill the agent process gracefully
				try {
					proc.kill("SIGINT");
				} catch {}
				ctx.runningProcs.delete(key);

				// Clear the agent's timer
				if (state.timer) {
					clearInterval(state.timer);
					state.timer = undefined;
				}

				// Update agent status to idle (not error - intentional stop)
				state.elapsed = Date.now() - (Date.now() - state.elapsed);
				state.status = "idle";

				// Keep session file intact for context preservation (unless stateless)
				if (isStateless(key) && state.sessionFile && existsSync(state.sessionFile)) {
					try { unlinkSync(state.sessionFile); } catch {}
					state.sessionFile = null;
				}

				stoppedAgents.push(displayName(state.def.name));
			}
		}

		// If we stopped any agents, update widget and notify, then prevent exit
		if (stoppedAgents.length > 0) {
			ctx.updateWidget();

			// Notify user
			if (ctx.widgetCtx) {
				ctx.widgetCtx.ui.notify(
					`Stopped ${stoppedAgents.join(", ")}`,
					"info"
				);
			}

			// Prevent default exit - stay in Pi session
			return;
		}

		// No agent running - let default SIGINT behavior occur
		// This allows normal Pi exit when nothing is running
	});

	pi.on("message_start", async (event: any) => {
		try {
			if (event?.message?.role !== "assistant") return;
			const startMs = typeof event.message.timestamp === "number" ? event.message.timestamp : Date.now();
			ctx.footerMetrics = resetFooterMetrics(startMs);
		} catch {}
	});

	pi.on("message_update", async (event: any) => {
		try {
			if (event?.message?.role !== "assistant") return;
			const delta = event?.assistantMessageEvent;
			ctx.footerMetrics = recordFooterDelta(ctx.footerMetrics, delta, Date.now());
		} catch {}
	});

	pi.on("message_end", async (event: any) => {
		try {
			if (event?.message?.role !== "assistant") return;
			ctx.footerMetrics = completeFooterMetrics(ctx.footerMetrics, event.message.usage, Date.now());
		} catch {}
	});
}

export function registerSessionStart(pi: ExtensionAPI, ctx: AgentTeamContext): void {
	pi.on("session_start", async (_event, context: ExtensionContext) => {
		ctx.widgetCtx = context;
		ctx.contextWindow = context.model?.contextWindow || 0;

		ctx.loadAgents(context.cwd);

		// Default to first team — use /agents-team to switch
		const teamNames = Object.keys(ctx.teams);
		if (teamNames.length > 0) {
			ctx.activateTeam(teamNames[0]);
		}

		// Set active tools: merge existing registered tools + front matter + subagent tools
		const existingTools = pi.getActiveTools();
		const requestedTools = new Set([
			...existingTools,
			...ctx.orchestratorTools,
		]);
		pi.setActiveTools(Array.from(requestedTools));

		ctx.updateWidget();
		ctx.updateStatelessWidget();
	});
}