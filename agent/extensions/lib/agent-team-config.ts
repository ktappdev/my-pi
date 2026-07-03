import { readdirSync, readFileSync, existsSync, mkdirSync, writeFileSync } from "fs";
import { dirname, join, resolve } from "path";
import { homedir } from "os";

export interface AgentDef {
	name: string;
	description: string;
	tools: string;
	systemPrompt: string;
	file: string;
	model?: string;
	thinking?: string;
	loadProviders?: boolean; // Whether to load provider extensions (default: true)
}

export function getProjectBaseDir(cwd: string): string {
	let current = resolve(cwd);

	while (true) {
		if (existsSync(join(current, ".git")) || existsSync(join(current, ".pi"))) {
			return current;
		}

		const parent = dirname(current);
		if (parent === current) break;
		current = parent;
	}

	const piPathMatch = resolve(cwd).match(/^(.*)\/\.pi(?:\/.*)?$/);
	return piPathMatch ? piPathMatch[1] : resolve(cwd);
}

export function getProjectPiDir(cwd: string): string {
	return join(getProjectBaseDir(cwd), ".pi");
}

export function getProjectAgentsDir(cwd: string): string {
	return join(getProjectPiDir(cwd), "agents");
}

export function getPiCodingAgentDir(): string {
	const override = process.env.PI_CODING_AGENT_DIR?.trim();
	return override ? resolve(override) : join(homedir(), ".pi", "agent");
}

export function getGlobalAgentsDir(): string {
	return join(getPiCodingAgentDir(), "agents");
}

export function mergeSystemPrompt(basePrompt: string): string {
	const prompt = basePrompt.trim();
	const sharedPrompt = getSharedEngramPrompt();
	if (!sharedPrompt) return prompt;
	if (!prompt) return sharedPrompt;
	return `${prompt}\n\n---\n\n${sharedPrompt}`;
}

export function ensureDir(dir: string) {
	if (!existsSync(dir)) {
		try { mkdirSync(dir, { recursive: true }); } catch {}
	}
}

export function ensureGitignoreEntry(projectRoot: string, entry: string) {
	const gitignorePath = join(projectRoot, ".gitignore");
	let content = "";
	try {
		content = existsSync(gitignorePath) ? readFileSync(gitignorePath, "utf-8") : "";
	} catch {
		return;
	}

	const lines = content.split(/\r?\n/).map(line => line.trim());
	if (lines.includes(entry)) return;

	const base = content.length > 0 && !content.endsWith("\n") ? `${content}\n` : content;
	writeFileSync(gitignorePath, `${base}${entry}\n`, "utf-8");
}

export function readJsonObject(path: string): Record<string, any> {
	try {
		return JSON.parse(readFileSync(path, "utf-8"));
	} catch {
		return {};
	}
}

export function writeJsonObject(path: string, value: Record<string, any>) {
	try {
		ensureDir(dirname(path));
		writeFileSync(path, JSON.stringify(value, null, 2) + "\n", "utf-8");
	} catch {
		// ignore
	}
}

export function getMergedSettings(cwd: string): Record<string, any> {
	const globalSettings = readJsonObject(join(getPiCodingAgentDir(), "settings.json"));
	const projectSettings = readJsonObject(join(getProjectPiDir(cwd), "settings.json"));
	return { ...globalSettings, ...projectSettings };
}

export function getAgentTeamViewMode(cwd: string): "grid" | "table" | "tactical" {
	const raw = getMergedSettings(cwd)?.agentTeamViewMode;
	return raw === "grid" || raw === "table" || raw === "tactical" ? raw : "tactical";
}

export function persistAgentTeamViewMode(cwd: string, mode: "grid" | "table" | "tactical") {
	const globalPath = join(getPiCodingAgentDir(), "settings.json");
	const globalSettings = readJsonObject(globalPath);
	writeJsonObject(globalPath, { ...globalSettings, agentTeamViewMode: mode });
}

export function getSessionThinkingLevelFallback(cwd: string): string {
	const lvl = getMergedSettings(cwd)?.defaultThinkingLevel;
	return typeof lvl === "string" && lvl.trim() ? lvl.trim() : "off";
}

export function getGlobalTeamsPath(): string {
	return join(getGlobalAgentsDir(), "teams.yaml");
}

export function getProjectTeamsPath(cwd: string): string {
	ensureDir(getProjectAgentsDir(cwd));
	return join(getProjectAgentsDir(cwd), "teams.yaml");
}

export function getGlobalAgentModelsPath(): string {
	return join(getGlobalAgentsDir(), "agent-models.yaml");
}

export function getProjectAgentModelsPath(cwd: string): string {
	ensureDir(getProjectAgentsDir(cwd));
	return join(getProjectAgentsDir(cwd), "agent-models.yaml");
}

export function getGlobalAgentThinkingPath(): string {
	return join(getGlobalAgentsDir(), "agent-thinking.yaml");
}

export function getProjectAgentThinkingPath(cwd: string): string {
	ensureDir(getProjectAgentsDir(cwd));
	return join(getProjectAgentsDir(cwd), "agent-thinking.yaml");
}

export function getGlobalAgentStatelessPath(): string {
	return join(getGlobalAgentsDir(), "agent-stateless.yaml");
}

export function getProjectAgentStatelessPath(cwd: string): string {
	ensureDir(getProjectAgentsDir(cwd));
	return join(getProjectAgentsDir(cwd), "agent-stateless.yaml");
}

export function writeYamlMap(path: string, values: Record<string, string>) {
	ensureDir(dirname(path));
	const lines = Object.entries(values)
		.sort(([a], [b]) => a.localeCompare(b))
		.map(([key, value]) => `${key}: ${value}`);
	writeFileSync(path, lines.join("\n") + "\n", "utf-8");
}

export function displayName(name: string): string {
	return name.split("-").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}

export function parseAgentModelsYaml(raw: string): Record<string, string> {
	const models: Record<string, string> = {};
	for (const line of raw.split("\n")) {
		const match = line.match(/^([^:]+):\s*(.+)$/);
		if (match) {
			const agentName = match[1].trim();
			let model = match[2].trim();
			if ((model.startsWith('"') && model.endsWith('"')) ||
				(model.startsWith("'") && model.endsWith("'"))) {
				model = model.slice(1, -1);
			}
			models[agentName.toLowerCase()] = model;
		}
	}
	return models;
}

export function parseTeamsYaml(raw: string): Record<string, string[]> {
	const teams: Record<string, string[]> = {};
	let current: string | null = null;
	for (const line of raw.split("\n")) {
		const teamMatch = line.match(/^(\S[^:]*):$/);
		if (teamMatch) {
			current = teamMatch[1].trim();
			teams[current] = [];
			continue;
		}
		const itemMatch = line.match(/^\s+-\s+(.+)$/);
		if (itemMatch && current) {
			teams[current].push(itemMatch[1].trim());
		}
	}
	return teams;
}

export function readTeamsFile(path: string): Record<string, string[]> {
	try {
		return parseTeamsYaml(readFileSync(path, "utf-8"));
	} catch {
		return {};
	}
}

export function readAgentYamlMap(path: string): Record<string, string> {
	try {
		return parseAgentModelsYaml(readFileSync(path, "utf-8"));
	} catch {
		return {};
	}
}

export function parseAgentFile(filePath: string): AgentDef | null {
	try {
		const raw = readFileSync(filePath, "utf-8");
		const match = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
		if (!match) return null;

		const frontmatter: Record<string, string> = {};
		for (const line of match[1].split("\n")) {
			const idx = line.indexOf(":");
			if (idx > 0) {
				frontmatter[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
			}
		}

		if (!frontmatter.name) return null;

		return {
			name: frontmatter.name,
			description: frontmatter.description || "",
			tools: frontmatter.tools || "read,grep,find,ls",
			systemPrompt: match[2].trim(),
			file: filePath,
			model: frontmatter.model,
			thinking: frontmatter.thinking,
		};
	} catch {
		return null;
	}
}

export function scanAgentDirs(cwd: string): AgentDef[] {
	const dirs = [
		join(cwd, "agents"),
		join(cwd, ".pi", "agents"),
		getGlobalAgentsDir(),
	];

	const agents: AgentDef[] = [];
	const seen = new Set<string>();

	for (const dir of dirs) {
		if (!existsSync(dir)) continue;
		try {
			for (const file of readdirSync(dir)) {
				if (!file.endsWith(".md")) continue;
				const fullPath = resolve(dir, file);
				const def = parseAgentFile(fullPath);
				if (!def) continue;
				if (def.name.toLowerCase() === "kyrie") continue;
				if (!seen.has(def.name.toLowerCase())) {
					seen.add(def.name.toLowerCase());
					agents.push(def);
				}
			}
		} catch {}
	}

	return agents;
}

export function getTeamsSources(cwd: string): { globalPath: string; projectPath: string; loadedFrom: string[] } {
	const globalPath = getGlobalTeamsPath();
	const projectPath = getProjectTeamsPath(cwd);
	const loadedFrom: string[] = [];
	if (existsSync(globalPath)) loadedFrom.push(globalPath);
	if (existsSync(projectPath)) loadedFrom.push(projectPath);
	return { globalPath, projectPath, loadedFrom };
}

export function mergeStringMaps(globalValues: Record<string, string>, projectValues: Record<string, string>): Record<string, string> {
	return { ...globalValues, ...projectValues };
}

export function mergeTeams(globalTeams: Record<string, string[]>, projectTeams: Record<string, string[]>): Record<string, string[]> {
	return { ...globalTeams, ...projectTeams };
}

function getSharedEngramPrompt(): string {
	const promptPath = resolve(getPiCodingAgentDir(), "extensions", "ENGRAM.md");
	if (!existsSync(promptPath)) return "";

	try {
		return readFileSync(promptPath, "utf-8").trim();
	} catch {
		return "";
	}
}
