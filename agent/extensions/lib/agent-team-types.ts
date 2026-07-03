import type { AgentDef, AgentTeamViewMode } from "./agent-team-config.js";
import type { FooterMetricsState } from "./agent-team-footer-metrics.js";

export interface AgentState {
	def: AgentDef;
	status: "idle" | "running" | "done" | "error";
	task: string;
	toolCount: number;
	elapsed: number;
	lastWork: string[];
	contextPct: number;
	sessionFile: string | null;
	runCount: number;
	model?: string;
	thinking?: string;
	timer?: ReturnType<typeof setInterval>;
}

export interface DispatchResult {
	output: string;
	exitCode: number;
	elapsed: number;
}

export interface AgentTeamContext {
	// State
	agentStates: Map<string, AgentState>;
	agentLogs: Map<string, string[]>;
	runningProcs: Map<string, ReturnType<typeof import("child_process").spawn>>;
	allAgentDefs: AgentDef[];
	globalTeams: Record<string, string[]>;
	projectTeams: Record<string, string[]>;
	teams: Record<string, string[]>;
	globalAgentModels: Record<string, string>;
	projectAgentModels: Record<string, string>;
	agentModels: Record<string, string>;
	globalAgentThinking: Record<string, string>;
	projectAgentThinking: Record<string, string>;
	agentThinking: Record<string, string>;
	activeTeamName: string;
	gridCols: number;
	viewMode: AgentTeamViewMode;
	watchAgentKey: string | null;
	widgetCtx: any;
	orchestratorTools: string[];
	sessionDir: string;
	globalStatelessPath: string;
	projectStatelessPath: string;
	contextWindow: number;
	footerMetrics: FooterMetricsState;
	contextingStatus: "snapshot" | "memory" | "unavailable";
	cwd: string;

	// Functions
	updateWidget: () => void;
	updateStatelessWidget: () => void;
	loadAgents: (cwd: string) => void;
	activateTeam: (teamName: string) => void;
	appendAgentLog: (key: string, line: string) => void;
	resolveAgentByInput: (input: string) => AgentState | null;
	buildErrorOutput: (
		code: number,
		fullLines: string[],
		logs: string[],
		model: string,
		thinking: string | undefined,
		defThinking: string | undefined,
		tools: string,
	) => string;
	summarizeToolCall: (toolName: string, toolArgs: any) => string;
}

export const MAX_AGENT_LOG_LINES = 500;