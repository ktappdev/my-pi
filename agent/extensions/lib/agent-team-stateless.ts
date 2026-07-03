/**
 * Agent Team Stateless Mode
 *
 * Controls whether agents retain context across dispatches.
 * Stateless agents start fresh every dispatch — session file is deleted before
 * spawn and never saved after completion.
 *
 * Two layers:
 *  - Global mode: affects ALL agents
 *  - Per-agent set: affects specific agents
 *
 * Persisted per-project to .pi/agents/agent-stateless.yaml
 * Also persisted globally to ~/.pi/agent/agents/agent-stateless.yaml
 * Project settings override global settings.
 *
 * Data format (YAML key-value):
 *   mode: on|off
 *   scout: stateless
 *   builder: stateless
 */

import { existsSync, readFileSync, writeFileSync } from "fs";
import { dirname } from "path";
import { ensureDir, readAgentYamlMap } from "./agent-team-config.ts";

const statelessAgents: Set<string> = new Set();
let statelessMode = false;

/** Load stateless config from global + project files (project overrides global) */
export function load(globalPath: string, projectPath: string): void {
	statelessAgents.clear();
	statelessMode = false;

	const globalValues = existsSync(globalPath) ? readAgentYamlMap(globalPath) : {};
	const projectValues = existsSync(projectPath) ? readAgentYamlMap(projectPath) : {};
	const merged = { ...globalValues, ...projectValues };

	if (merged["mode"] === "on") {
		statelessMode = true;
	}

	for (const [key, value] of Object.entries(merged)) {
		if (key !== "mode" && value === "stateless") {
			statelessAgents.add(key);
		}
	}
}

/** Persist current state to the given file path */
export function save(path: string): void {
	const entries: Record<string, string> = {};
	entries["mode"] = statelessMode ? "on" : "off";
	for (const key of statelessAgents) {
		entries[key] = "stateless";
	}

	ensureDir(dirname(path));
	const lines = Object.entries(entries)
		.sort(([a], [b]) => a.localeCompare(b))
		.map(([key, value]) => `${key}: ${value}`);
	writeFileSync(path, lines.join("\n") + "\n", "utf-8");
}

/** Check whether an agent should lose context on next dispatch */
export function isStateless(agentKey: string): boolean {
	return statelessMode || statelessAgents.has(agentKey);
}

/** Mark one or more agents as stateless */
export function markStateless(agentKey: string): void {
	statelessAgents.add(agentKey);
}

/** Remove an agent from the stateless set */
export function unmarkStateless(agentKey: string): void {
	statelessAgents.delete(agentKey);
}

/** Return all currently marked stateless agents */
export function listStateless(): string[] {
	return Array.from(statelessAgents);
}

/** Get global stateless mode state */
export function getStatelessMode(): boolean {
	return statelessMode;
}

/** Set global stateless mode */
export function setStatelessMode(on: boolean): void {
	statelessMode = on;
}
