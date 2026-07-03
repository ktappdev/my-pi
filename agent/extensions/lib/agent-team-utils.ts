import { existsSync, readdirSync, readFileSync } from "fs";
import { execSync } from "child_process";
import { join, homedir } from "path";
import { fileURLToPath } from "url";
import type { AgentTeamContext } from "./agent-team-types.js";

const EXTENSIONS_DIR = fileURLToPath(new URL(".", import.meta.url));

// Package names that are likely providers (fallback if code scan fails)
const PROVIDER_PACKAGE_PATTERNS = [
	"provider",
	"oauth",
].map(p => p.toLowerCase());

// Cache for discovered provider extensions
let cachedProviderExtensions: string[] | null = null;

export function hasEditCapabilities(tools: string): boolean {
	return tools
		.split(",")
		.map((tool) => tool.trim())
		.some((tool) => tool === "edit" || tool === "write");
}

/**
 * Discover provider extensions from installed packages
 * Scans git and npm package directories for extensions that register providers
 * Uses code analysis to detect registerProvider calls (most reliable)
 * Falls back to package name patterns if code is unreadable
 */
export function discoverProviderExtensions(): string[] {
	if (cachedProviderExtensions) {
		return cachedProviderExtensions;
	}

	const providers: string[] = [];
	const home = homedir();

	// Get global npm prefix (covers pi install npm: which uses npm -g)
	let npmGlobalPrefix = "";
	try {
		npmGlobalPrefix = execSync("npm prefix -g", { encoding: "utf-8", timeout: 3000 }).trim();
	} catch {}
	const globalNodeModules = npmGlobalPrefix
		? join(npmGlobalPrefix, "node_modules")
		: join("/opt/homebrew/lib", "node_modules");

	const packageDirs = [
		join(home, ".pi", "agent", "git"),
		join(home, ".pi", "agent", "npm"),
		join(home, ".pi", "agent", "npm", "node_modules"),
		join(home, ".pi", "agent", "extensions", "node_modules"),
		globalNodeModules,
	];

	for (const dir of packageDirs) {
		if (!existsSync(dir)) continue;

		try {
			const entries = readdirSync(dir, { withFileTypes: true });
			for (const entry of entries) {
				if (!entry.isDirectory()) continue;
				const pkgPath = join(dir, entry.name, "package.json");
				if (!existsSync(pkgPath)) continue;

				try {
					const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
					// Skip if already known provider package
					if (PROVIDER_PACKAGE_PATTERNS.some((p) => pkg.name?.toLowerCase().includes(p))) {
						const extPath = join(dir, entry.name);
						if (existsSync(join(extPath, "extensions")) || existsSync(join(extPath, "extension.ts")) || existsSync(join(extPath, "extension.js"))) {
							providers.push(extPath);
						}
						continue;
					}

					// Code analysis: scan for registerProvider calls
					const extDir = join(dir, entry.name, "extensions");
					const extFile = join(dir, entry.name, "extension.ts");
					const extJsFile = join(dir, entry.name, "extension.js");

					const filesToScan: string[] = [];
					if (existsSync(extDir)) {
						try {
							const extEntries = readdirSync(extDir, { withFileTypes: true });
							for (const extEntry of extEntries) {
								if (extEntry.isFile() && (extEntry.name.endsWith(".ts") || extEntry.name.endsWith(".js"))) {
									filesToScan.push(join(extDir, extEntry.name));
								}
							}
						} catch {}
					}
					if (existsSync(extFile)) filesToScan.push(extFile);
					if (existsSync(extJsFile)) filesToScan.push(extJsFile);

					for (const file of filesToScan) {
						try {
							const content = readFileSync(file, "utf-8");
							if (content.includes("registerProvider")) {
								providers.push(join(dir, entry.name));
								break;
							}
						} catch {}
					}
				} catch {}
			}
		} catch {}
	}

	cachedProviderExtensions = providers;
	return providers;
}

export function getSubagentExtensionArgs(
	agentName: string,
	tools: string,
	loadProviders: boolean = true,
): string[] {
	const args: string[] = [];
	const home = homedir();

	// Always load pi-caveman for orchestrator/caveman
	if (agentName.toLowerCase() === "orchestrator" || agentName.toLowerCase() === "caveman") {
		const cavemanPath = join(home, ".pi", "agent", "git", "github.com", "jonjonrankin", "pi-caveman");
		if (existsSync(cavemanPath)) {
			args.push("-e", cavemanPath);
		}
		return args;
	}

	// Load context.ts for sub-agents (footer metrics)
	const contextPath = join(home, ".pi", "piii", "extensions", "context.ts");
	if (existsSync(contextPath)) {
		args.push("-e", contextPath);
	}

	// Load provider extensions if agent has edit/write capabilities
	if (loadProviders && hasEditCapabilities(tools)) {
		const providers = discoverProviderExtensions();
		for (const provider of providers) {
			args.push("-e", provider);
		}
	}

	return args;
}

// Cache for pi executable path
let cachedPiPath: string | null = null;

export function findPiExecutable(): string {
	if (cachedPiPath) return cachedPiPath;

	// 1. Check environment variable override
	const envPath = process.env.PI_PATH;
	if (envPath && existsSync(envPath)) {
		cachedPiPath = envPath;
		return cachedPiPath;
	}

	// 2. Try 'which pi' command
	try {
		const whichOutput = execSync("which pi", { encoding: "utf-8" }).trim();
		if (whichOutput && existsSync(whichOutput)) {
			cachedPiPath = whichOutput;
			return cachedPiPath;
		}
	} catch {
		// which command failed or pi not in PATH
	}

	// 3. Check common installation paths
	const home = homedir();
	const commonPaths: string[] = [
		// macOS Homebrew
		"/opt/homebrew/bin/pi",
		"/usr/local/bin/pi",
		// Global npm
		"/usr/bin/pi",
	];

	for (const path of commonPaths) {
		if (existsSync(path)) {
			cachedPiPath = path;
			return cachedPiPath;
		}
	}

	// 4. Try to find mise-installed pi dynamically
	try {
		const miseInstallsDir = join(home, ".local", "share", "mise", "installs");
		if (existsSync(miseInstallsDir)) {
			const nodeVersions = readdirSync(miseInstallsDir);
			for (const version of nodeVersions) {
				const piPath = join(miseInstallsDir, version, "bin", "pi");
				if (existsSync(piPath)) {
					cachedPiPath = piPath;
					return cachedPiPath;
				}
			}
		}
	} catch {
		// mise directory not accessible
	}

	// 5. Last resort: try nvm directories dynamically
	try {
		const nvmDir = join(home, ".nvm", "versions", "node");
		if (existsSync(nvmDir)) {
			const versions = readdirSync(nvmDir);
			for (const version of versions) {
				const piPath = join(nvmDir, version, "bin", "pi");
				if (existsSync(piPath)) {
					cachedPiPath = piPath;
					return cachedPiPath;
				}
			}
		}
	} catch {
		// nvm directory not accessible
	}

	// If nothing found, return the Homebrew path as default (will fail with clear error)
	cachedPiPath = "/opt/homebrew/bin/pi";
	return cachedPiPath;
}

export function detectContexting(cwd: string): "snapshot" | "memory" | "unavailable" {
	// Check for live watch mode first (fastest, most current)
	if (existsSync(join(cwd, ".contexting_runtime.json"))) return "memory";
	// Check for snapshot index
	if (existsSync(join(cwd, "context.json"))) return "snapshot";
	return "unavailable";
}

export async function fetchAvailableModels(): Promise<string[]> {
	const { spawn } = await import("child_process");

	return new Promise((resolve) => {
		const proc = spawn(findPiExecutable(), ["--list-models"], {
			stdio: ["ignore", "pipe", "pipe"],
		});

		let output = "";
		const collect = (chunk: string) => {
			output += chunk;
		};

		proc.stdout!.setEncoding("utf-8");
		proc.stdout!.on("data", collect);
		proc.stderr!.setEncoding("utf-8");
		proc.stderr!.on("data", collect);

		proc.on("close", () => {
			const models: string[] = [];
			const lines = output.split("\n");

			for (const line of lines) {
				// Skip header and empty lines
				if (!line.trim() || line.toLowerCase().startsWith("provider")) continue;

				// Parse table format: provider    model-id    context    output    thinking    vision
				const parts = line.trim().split(/\s{2,}/);
				if (parts.length >= 2) {
					const provider = parts[0].trim();
					const modelId = parts[1].trim();
					// Always return a full `provider/model` identifier.
					// Some model ids themselves contain `/` (e.g. OpenRouter uses `ai21/jamba...`),
					// so we must not treat that as already provider-qualified.
					if (provider && modelId) {
						const full = modelId.startsWith(`${provider}/`) ? modelId : `${provider}/${modelId}`;
						models.push(full);
					}
				}
			}

			resolve(Array.from(new Set(models)));
		});

		proc.on("error", () => {
			// Fallback to empty list on error
			resolve([]);
		});
	});
}