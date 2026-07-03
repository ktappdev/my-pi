/**
 * Ask Mode Extension
 *
 * Read-only Q&A mode for safe code analysis and questions.
 * When enabled, only read-only tools are available.
 *
 * Features:
 * - /ask command to toggle
 * - Bash restricted to allowlisted read-only commands
 * - bd commands allowed for issue tracking
 * - State persists across session resume
 */

import type { AgentMessage } from "@mariozechner/pi-agent-core";
import type { TextContent } from "@mariozechner/pi-ai";
import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { Key } from "@mariozechner/pi-tui";
import { isSafeCommand } from "./lib/ask-mode-utils.js";

const ASK_MODE_TOOLS = ["read", "bash", "grep", "find", "ls", "questionnaire"];

function isAssistantMessage(m: AgentMessage): m is AgentMessage & { content: unknown } {
	return m.role === "assistant" && Array.isArray(m.content);
}

export default function askModeExtension(pi: ExtensionAPI): void {
	let askModeEnabled = false;

	pi.registerFlag("ask", {
		description: "Start in ask mode (read-only Q&A)",
		type: "boolean",
		default: false,
	});

	function updateStatus(ctx: ExtensionContext): void {
		if (askModeEnabled) {
			const w = ctx.ui.theme.fg("warning", "[ASK]");
			ctx.ui.setWidget("ask-mode", [`${w} ask mode — read-only Q&A · /ask to disable`]);
		} else {
			ctx.ui.setWidget("ask-mode", undefined);
		}
	}

	function toggleAskMode(ctx: ExtensionContext): void {
		askModeEnabled = !askModeEnabled;

		if (askModeEnabled) {
			pi.setActiveTools(ASK_MODE_TOOLS);
			ctx.ui.notify(`Ask mode enabled. Tools: ${ASK_MODE_TOOLS.join(", ")}`);
		} else {
			const allTools = pi.getAllTools().map(t => t.name);
			pi.setActiveTools(allTools);
			ctx.ui.notify("Ask mode disabled. Full access restored.");
		}
		updateStatus(ctx);
		persistState();
	}

	function persistState(): void {
		pi.appendEntry("ask-mode", {
			enabled: askModeEnabled,
		});
	}

	pi.registerCommand("ask", {
		description: "Toggle ask mode (read-only Q&A)",
		handler: async (_args, ctx) => toggleAskMode(ctx),
	});

	pi.registerShortcut(Key.ctrlShift("a"), {
		description: "Toggle ask mode",
		handler: async (ctx) => toggleAskMode(ctx),
	});

	pi.on("tool_call", async (event) => {
		if (!askModeEnabled) return;

		if (event.toolName === "bash") {
			const command = event.input.command as string;
			if (!isSafeCommand(command)) {
				return {
					block: true,
					reason: `Ask mode: command blocked (not allowlisted). Use /ask to disable ask mode first.\nCommand: ${command}`,
				};
			}
		}

		if (["edit", "write"].includes(event.toolName)) {
			return {
				block: true,
				reason: `Ask mode: ${event.toolName} is disabled. Use /ask to disable ask mode first.`,
			};
		}
	});

	pi.on("context", async (event) => {
		if (askModeEnabled) return;

		return {
			messages: event.messages.filter((m) => {
				const msg = m as AgentMessage & { customType?: string };
				if (msg.customType === "ask-mode-context") return false;
				return true;
			}),
		};
	});

	pi.on("before_agent_start", async () => {
		if (!askModeEnabled) return;

		return {
			message: {
				customType: "ask-mode-context",
				content: `[ASK MODE ACTIVE]
You are in ask mode — a read-only Q&A mode for safe code analysis.
- You can only use: read, bash (read-only allowlist), grep, find, ls, questionnaire
- bd commands are allowed for issue tracking
- You CANNOT use: edit, write, dispatch_agent
- Bash is restricted to read-only commands and bd/engram
- Answer questions directly from context or by reading files
- Do NOT propose file changes or implementation plans
- If the user wants implementation, tell them to toggle ask mode off with /ask`,
				display: false,
			},
		};
	});

	pi.on("turn_end", async () => {
		if (askModeEnabled) {
			persistState();
		}
	});

	pi.on("session_start", async (_event, ctx) => {
		if (pi.getFlag("ask") === true) {
			askModeEnabled = true;
		}

		const entries = ctx.sessionManager.getEntries();
		const askModeEntry = entries
			.filter((e: { type: string; customType?: string }) => e.type === "custom" && e.customType === "ask-mode")
			.pop() as { data?: { enabled: boolean } } | undefined;

		if (askModeEntry?.data) {
			askModeEnabled = askModeEntry.data.enabled ?? askModeEnabled;
		}

		if (askModeEnabled) {
			pi.setActiveTools(ASK_MODE_TOOLS);
		}
		updateStatus(ctx);
	});
}
