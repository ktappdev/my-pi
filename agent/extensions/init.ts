import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import path from "node:path";
import fs from "node:fs/promises";

const AGENTS_FILE = "AGENTS.md";

async function pathExists(filePath: string): Promise<boolean> {
	try {
		await fs.access(filePath);
		return true;
	} catch {
		return false;
	}
}

function helpText(): string {
	return [
		"/init         - ask Caveman/Scout/Builder to create or improve AGENTS.md here",
		"/init --w     - mention monorepo workspace-aware behavior for root-level initialization",
		"/init --help  - show this help",
	].join("\n");
}

function buildPrompt(cwd: string, agentsExists: boolean, includeWorkspaces: boolean): string {
	const filePath = path.join(cwd, AGENTS_FILE);
	const workspaceNote = includeWorkspaces
		? "- If this is a monorepo root, also consider whether missing workspace-level AGENTS.md files should be created where helpful.\n"
		: "";
	const existingMode = agentsExists
		? `There is already an ${AGENTS_FILE} at \`${filePath}\`. Improve it sparingly instead of replacing user-authored guidance.`
		: `Create a new ${AGENTS_FILE} at \`${filePath}\`.`;

	return [
		`${existingMode}`,
		"",
		"Use the agent team workflow:",
		"- Caveman should orchestrate.",
		"- Scout should do discovery/read-only analysis.",
		"- Builder should make the file edits.",
		"",
		"Analyze this repository and produce a concise, durable AGENTS.md for future coding agents.",
		"",
		"Prioritize:",
		"- important build/lint/test commands, especially single-test commands when discoverable",
		"- coding conventions that are explicitly documented or strongly implied by repo config",
		"- guidance from .cursor/rules/, .cursorrules, and .github/copilot-instructions.md if present",
		"- durable repo-specific workflow notes, gotchas, migrations, codegen, env setup, generated files, and validation expectations",
		"- user preferences already known in this environment, including keeping files/components smaller and never auto-running the project",
		workspaceNote.trimEnd(),
		"",
		"Avoid:",
		"- volatile directory or file structure summaries",
		"- obvious tech stack summaries that agents can infer later",
		"- guessed conventions not supported by the repository",
		"- bloated output",
		"",
		"Output requirements:",
		"- Start with a 1-3 sentence project description (what it does, not how it works)",
		"- Keep the final AGENTS.md concise and high-signal.",
	].filter(Boolean).join("\n");
}

function parseArgs(args: string): { includeWorkspaces: boolean; showHelp: boolean } {
	const tokens = args.split(/\s+/).map((token) => token.trim()).filter(Boolean);
	return {
		includeWorkspaces: tokens.includes("--w"),
		showHelp: tokens.includes("--help") || tokens.includes("-h") || tokens.includes("help"),
	};
}

export default function initExtension(pi: ExtensionAPI): void {
	pi.registerCommand("init", {
		description: "Ask Caveman/Scout/Builder to create or improve AGENTS.md in the current project",
		getArgumentCompletions: (prefix) => {
			const items = [
				{ value: "--w", label: "--w", description: "Mention workspace-aware monorepo initialization" },
				{ value: "--help", label: "--help", description: "Show help" },
			];
			const trimmed = prefix.trim().toLowerCase();
			return !trimmed ? items : items.filter((item) => item.value.startsWith(trimmed));
		},
		handler: async (args, ctx) => {
			const options = parseArgs(args);
			if (options.showHelp) {
				ctx.ui.notify(helpText(), "info");
				return;
			}

			const cwd = path.resolve(ctx.cwd);
			const agentsPath = path.join(cwd, AGENTS_FILE);
			const prompt = buildPrompt(cwd, await pathExists(agentsPath), options.includeWorkspaces);

			if (ctx.isIdle()) {
				pi.sendUserMessage(prompt);
			} else {
				pi.sendUserMessage(prompt, { deliverAs: "followUp" });
				ctx.ui.notify("/init queued as a follow-up task for Caveman.", "info");
			}
		},
	});
}
