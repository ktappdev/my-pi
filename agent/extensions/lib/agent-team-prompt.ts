import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { existsSync, readFileSync } from "fs";
import { join, resolve } from "path";
import { homedir } from "os";
import type { AgentTeamContext } from "./agent-team-types.js";
import { getPiCodingAgentDir, displayName, mergeSystemPrompt } from "./agent-team-config.js";

export function registerPromptHandler(pi: ExtensionAPI, ctx: AgentTeamContext): void {
	pi.on("before_agent_start", async (_event, _ctx) => {
		const agentCatalog = Array.from(ctx.agentStates.values())
			.map(s => `### ${displayName(s.def.name)}\n**Dispatch as:** \`${s.def.name}\`\n${s.def.description}\n**Tools:** ${s.def.tools}`)
			.join("\n\n");

		const teamMembers = Array.from(ctx.agentStates.values()).map(s => displayName(s.def.name)).join(", ");

		// Read the Orchestrator prompt and tools from the agents directory
		const orchestratorPromptPath = resolve(getPiCodingAgentDir(), "agents", "orchestrator.md");
		let orchestratorPrompt = "";
		if (existsSync(orchestratorPromptPath)) {
			try {
				const raw = readFileSync(orchestratorPromptPath, "utf-8");
				const match = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
				if (match) {
					const toolsMatch = match[1].match(/^tools:\s*(.+)$/m);
					if (toolsMatch) {
						ctx.orchestratorTools = toolsMatch[1].split(",").map((t: string) => t.trim()).filter(Boolean);
					}
					orchestratorPrompt = match[2].trim();
				}
			} catch {}
		}
		if (!orchestratorPrompt) {
			orchestratorPrompt = `You are a dispatcher agent. You coordinate specialist agents to accomplish tasks.
You do NOT have direct access to the codebase. You MUST delegate all work through
agents using the dispatch_agent tool.

## Active Team: ${ctx.activeTeamName}
Members: ${teamMembers}

## How to Work
- Analyze the user's request and break into sub-tasks
- If there's an error, give a brief diagnosis first
- Dispatch to the right specialist using dispatch_agent
- Review results and dispatch follow-ups as needed

## Dispatch Format
- Objective: one sentence outcome
- Context: key facts, file paths, prior attempts
- Action Steps: short numbered list
- Deliverables: expected output

## Agents

${agentCatalog}`;
		}

		// Inject dynamic content into the Orchestrator prompt
		const finalPrompt = mergeSystemPrompt(orchestratorPrompt
			.replace(/\${agentCatalog}/g, agentCatalog)
			.replace(/\${teamMembers}/g, teamMembers)
			.replace(/\${activeTeamName}/g, ctx.activeTeamName));

		// Load global APPEND_SYSTEM.md and append to orchestrator prompt
		const globalAppendPath = join(homedir(), '.pi', 'agent', 'APPEND_SYSTEM.md');
		const globalAppend = existsSync(globalAppendPath) ? readFileSync(globalAppendPath, 'utf-8').trim() : '';

		// Format available skills (same XML format as pi's formatSkillsForPrompt)
		const loadedSkills = (_event as any).systemPromptOptions?.skills ?? [];
		const visibleSkills = loadedSkills.filter((s: any) => !s.disableModelInvocation);
		let skillsSection = '';
		if (visibleSkills.length > 0) {
			const skillLines = [
				'\n\nThe following skills provide specialized instructions for specific tasks.',
				'Use the read tool to load a skill\'s file when the task matches its description.',
				'When a skill file references a relative path, resolve it against the skill directory (parent of SKILL.md / dirname of the path) and use that absolute path in tool commands.',
				'',
				'<available_skills>',
			];
			for (const skill of visibleSkills) {
				const escapeXml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
				skillLines.push('  <skill>');
				skillLines.push(`    <name>${escapeXml(skill.name)}</name>`);
				skillLines.push(`    <description>${escapeXml(skill.description)}</description>`);
				skillLines.push(`    <location>${escapeXml(skill.filePath)}</location>`);
				skillLines.push('  </skill>');
			}
			skillLines.push('</available_skills>');
			skillsSection = skillLines.join('\n');
		}

		return {
			systemPrompt: `${finalPrompt}${skillsSection}${globalAppend ? `\n\n---\n\n${globalAppend}` : ``}`,
		};
	});
}