import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import * as os from "os";
import * as path from "path";

type WorktreeEntry = {
	worktree: string;
	branch?: string;
	head?: string;
	bare?: boolean;
	detached?: boolean;
	locked?: string;
	prunable?: string;
};

function splitArgs(input: string): string[] {
	const tokens: string[] = [];
	const re = /"([^"]*)"|'([^']*)'|(\S+)/g;
	let match: RegExpExecArray | null;
	while ((match = re.exec(input)) !== null) {
		tokens.push(match[1] ?? match[2] ?? match[3]);
	}
	return tokens;
}

function sanitizeSegment(input: string): string {
	const cleaned = input
		.replace(/\s+/g, "-")
		.replace(/[\\/:*?"<>|]+/g, "-")
		.replace(/-+/g, "-")
		.replace(/^[-.]+|[-.]+$/g, "");
	return cleaned || "worktree";
}

function oneLine(text: string): string {
	return text.trim().split("\n").filter(Boolean)[0] || "";
}

function expandHome(inputPath: string): string {
	if (!inputPath.startsWith("~")) return inputPath;
	if (inputPath === "~") return os.homedir();
	if (inputPath.startsWith("~/")) return path.join(os.homedir(), inputPath.slice(2));
	return inputPath;
}

function branchShort(ref?: string): string {
	if (!ref) return "detached";
	return ref.replace(/^refs\/heads\//, "");
}

function autoBranchBase(now = new Date()): string {
	const y = String(now.getFullYear());
	const m = String(now.getMonth() + 1).padStart(2, "0");
	const d = String(now.getDate()).padStart(2, "0");
	const hh = String(now.getHours()).padStart(2, "0");
	const mm = String(now.getMinutes()).padStart(2, "0");
	return `wt-${y}${m}${d}-${hh}${mm}`;
}

function parseWorktreePorcelain(text: string): WorktreeEntry[] {
	const entries: WorktreeEntry[] = [];
	let current: WorktreeEntry | null = null;

	for (const raw of text.split("\n")) {
		const line = raw.trimEnd();
		if (!line) {
			if (current) entries.push(current);
			current = null;
			continue;
		}

		const space = line.indexOf(" ");
		const key = space === -1 ? line : line.slice(0, space);
		const value = space === -1 ? "" : line.slice(space + 1);

		if (key === "worktree") {
			if (current) entries.push(current);
			current = { worktree: value };
			continue;
		}

		if (!current) continue;

		if (key === "HEAD") current.head = value;
		else if (key === "branch") current.branch = value;
		else if (key === "bare") current.bare = true;
		else if (key === "detached") current.detached = true;
		else if (key === "locked") current.locked = value;
		else if (key === "prunable") current.prunable = value;
	}

	if (current) entries.push(current);
	return entries;
}

export default function (pi: ExtensionAPI) {
	async function runGit(repoCwd: string, args: string[]) {
		return pi.exec("git", ["-C", repoCwd, ...args]);
	}

	async function resolveRepo(ctx: any, silent = false): Promise<string | null> {
		const baseCwd = process.cwd();
		const res = await runGit(baseCwd, ["rev-parse", "--show-toplevel"]);
		if (res.code !== 0) {
			if (!silent && ctx.hasUI) {
				ctx.ui.notify("Not in a git repository.", "error");
			}
			if (ctx.hasUI) {
				ctx.ui.setStatus("wt", undefined);
			}
			return null;
		}
		return res.stdout.trim();
	}

	async function getWorktrees(repoRoot: string): Promise<WorktreeEntry[]> {
		const res = await runGit(repoRoot, ["worktree", "list", "--porcelain"]);
		if (res.code !== 0) return [];
		return parseWorktreePorcelain(res.stdout);
	}

	async function makeUniqueAutoBranch(repoRoot: string): Promise<string> {
		const base = autoBranchBase();
		for (let i = 0; i < 100; i++) {
			const candidate = i === 0 ? base : `${base}-${i}`;
			const check = await runGit(repoRoot, ["rev-parse", "--verify", `refs/heads/${candidate}`]);
			if (check.code !== 0) return candidate;
		}
		return `${base}-${Date.now()}`;
	}

	async function refreshWorktreeStatus(ctx: any): Promise<void> {
		if (!ctx.hasUI) return;

		const repoRoot = await resolveRepo(ctx, true);
		if (!repoRoot) return;

		const list = await getWorktrees(repoRoot);
		const current = list.find((w) => path.resolve(w.worktree) === path.resolve(repoRoot));
		if (!current) {
			ctx.ui.setStatus("wt", "WT:main");
			return;
		}

		const common = await runGit(repoRoot, ["rev-parse", "--git-common-dir"]);
		const commonDir = common.code === 0 ? common.stdout.trim() : "";
		const mainRoot = commonDir ? path.resolve(repoRoot, commonDir, "..") : repoRoot;
		const isMain = path.resolve(repoRoot) === path.resolve(mainRoot);

		if (isMain) {
			ctx.ui.setStatus("wt", "WT:main");
		} else {
			ctx.ui.setStatus("wt", `WT:${branchShort(current.branch)}`);
		}
	}

	function defaultPathFor(repoRoot: string, branch: string): string {
		const repoName = sanitizeSegment(path.basename(repoRoot));
		const branchName = sanitizeSegment(branch.replace(/^refs\/heads\//, ""));
		return path.join(os.homedir(), "worktrees", repoName, branchName);
	}

	function helpText(): string {
		return [
			"/wt list                       - list current repo worktrees",
			"/wt add <branch> [path]        - create worktree for existing branch",
			"/wt new [branch] [path]        - create branch + worktree (auto-name if empty)",
			"/wt cd [path|branch]           - print cd command (or pick worktree)",
			"/wt rm <path|branch> [--force] - remove a worktree",
			"/wt prune                      - clean stale worktree metadata",
			"/wt help                       - show worktree command help",
			"",
			"Default path when omitted:",
			"  ~/worktrees/<repo>/<branch>",
		].join("\n");
	}

	function resolveTargetPath(entries: WorktreeEntry[], input: string): string | null {
		const byBranch = entries.find((e) => branchShort(e.branch) === input);
		if (byBranch) return byBranch.worktree;
		const normalizedInput = path.resolve(expandHome(input));
		const byPath = entries.find((e) => path.resolve(e.worktree) === normalizedInput);
		if (byPath) return byPath.worktree;
		if (input.includes("/") || input.startsWith(".") || input.startsWith("~")) {
			return normalizedInput;
		}
		return null;
	}

	pi.registerCommand("wt", {
		description: "Git worktree helper: /wt help",
		getArgumentCompletions: (prefix) => {
			const items = ["list", "add", "new", "cd", "rm", "prune", "help"].map((value) => ({ value, label: value }));
			const p = prefix.trim().toLowerCase();
			if (!p) return items;
			const filtered = items.filter((i) => i.value.startsWith(p));
			return filtered.length > 0 ? filtered : items;
		},
		handler: async (args, ctx) => {
			const repoRoot = await resolveRepo(ctx);
			if (!repoRoot) return;

			const argv = splitArgs(args || "");
			const cmd = (argv[0] || "help").toLowerCase();

			if (cmd === "help") {
				ctx.ui.notify(helpText(), "info");
				await refreshWorktreeStatus(ctx);
				return;
			}

			if (cmd === "list") {
				const list = await getWorktrees(repoRoot);
				if (list.length === 0) {
					ctx.ui.notify("Could not list worktrees. Repository may be corrupted or inaccessible.", "error");
					await refreshWorktreeStatus(ctx);
					return;
				}

				const lines = list.map((w) => {
					const isCurrent = path.resolve(w.worktree) === path.resolve(repoRoot);
					const b = branchShort(w.branch);
					const head = w.head ? w.head.slice(0, 8) : "--------";
					return `${isCurrent ? "*" : " "} ${w.worktree}  |  ${b}  |  ${head}`;
				});
				ctx.ui.notify(`Worktrees for ${repoRoot}\n${lines.join("\n")}`, "info");
				await refreshWorktreeStatus(ctx);
				return;
			}

			if (cmd === "prune") {
				const pruned = await runGit(repoRoot, ["worktree", "prune"]);
				if (pruned.code === 0) {
					ctx.ui.notify("Pruned stale worktree metadata.", "success");
				} else {
					ctx.ui.notify(oneLine(pruned.stderr) || "Failed to prune worktrees.", "error");
				}
				await refreshWorktreeStatus(ctx);
				return;
			}

			if (cmd === "add" || cmd === "new") {
				let branch = argv[1];
				const maybePath = argv[2];
				if (cmd === "add" && !branch) {
					ctx.ui.notify(`Usage: /wt ${cmd} <branch> [path]`, "error");
					return;
				}

				if (cmd === "new" && !branch) {
					branch = await makeUniqueAutoBranch(repoRoot);
				}

				if (!branch) {
					ctx.ui.notify("Could not determine branch name for worktree.", "error");
					return;
				}

				if (cmd === "add") {
					const branchCheck = await runGit(repoRoot, ["rev-parse", "--verify", `refs/heads/${branch}`]);
					if (branchCheck.code !== 0) {
						ctx.ui.notify(`Branch '${branch}' not found. Use /wt new ${branch} instead.`, "error");
						return;
					}
				}

				const targetPath = maybePath
					? path.resolve(process.cwd(), expandHome(maybePath))
					: defaultPathFor(repoRoot, branch);
				const cmdArgs = cmd === "new"
					? ["worktree", "add", "-b", branch, targetPath]
					: ["worktree", "add", targetPath, branch];
				const added = await runGit(repoRoot, cmdArgs);

				if (added.code !== 0) {
					ctx.ui.notify(oneLine(added.stderr) || "Failed to create worktree.", "error");
					await refreshWorktreeStatus(ctx);
					return;
				}

				try {
					process.chdir(targetPath);
					ctx.ui.notify(`Switched to new worktree: ${branch}`, "success");
					ctx.ui.notify(`Pi cwd: ${targetPath}`, "info");
				} catch {
					ctx.ui.notify("Worktree created, but auto-switch failed. Use /wt cd to jump.", "warning");
				}

				ctx.ui.notify(`Created worktree: ${targetPath}`, "success");
				ctx.ui.notify(`Open with: cd \"${targetPath}\"`, "info");
				await refreshWorktreeStatus(ctx);
				return;
			}

			if (cmd === "cd") {
				const targetInput = argv[1];
				const entries = await getWorktrees(repoRoot);
				let target: string | null = null;
				let targetBranch: string | null = null;

				if (targetInput) {
					target = resolveTargetPath(entries, targetInput);
					const entry = entries.find((e) => target && path.resolve(e.worktree) === path.resolve(target));
					targetBranch = entry ? branchShort(entry.branch) : null;
				} else {
					if (!ctx.hasUI) {
						ctx.ui.notify("Usage: /wt cd <path|branch>", "error");
						return;
					}
					if (entries.length === 0) {
						ctx.ui.notify("No worktrees found.", "info");
						return;
					}

					const options = entries.map((entry) => {
						const isCurrent = path.resolve(entry.worktree) === path.resolve(repoRoot);
						const marker = isCurrent ? "*" : " ";
						const branch = branchShort(entry.branch);
						return `${marker} ${branch} | ${entry.worktree}`;
					});

					const selected = await ctx.ui.select("Choose worktree", options);
					if (!selected) return;
					const index = options.indexOf(selected);
					target = index >= 0 ? entries[index].worktree : null;
					targetBranch = index >= 0 ? branchShort(entries[index].branch) : null;
				}

				if (!target) {
					ctx.ui.notify(`Could not resolve worktree: ${targetInput || "selection"}`, "error");
					return;
				}

				try {
					process.chdir(target);
					const label = targetBranch ? `Switched to worktree: ${targetBranch}` : "Switched to worktree";
					ctx.ui.notify(label, "success");
					ctx.ui.notify(`Pi cwd: ${target}`, "info");
				} catch {
					ctx.ui.notify("Could not switch Pi cwd. Use the printed cd command.", "warning");
				}

				ctx.ui.notify(`cd \"${target}\"`, "info");
				await refreshWorktreeStatus(ctx);
				return;
			}

			if (cmd === "rm") {
				if (!argv[1]) {
					ctx.ui.notify("Usage: /wt rm <path|branch> [--force]", "error");
					return;
				}

				const force = argv.includes("--force") || argv.includes("-f");
				const targetInput = argv.find((v, i) => i > 0 && v !== "--force" && v !== "-f");
				if (!targetInput) {
					ctx.ui.notify("Usage: /wt rm <path|branch> [--force]", "error");
					return;
				}

				const entries = await getWorktrees(repoRoot);
				const target = resolveTargetPath(entries, targetInput);
				if (!target) {
					ctx.ui.notify(`Could not resolve worktree: ${targetInput}`, "error");
					return;
				}

				const mainWorktree = entries[0];
				if (mainWorktree && path.resolve(target) === path.resolve(mainWorktree.worktree)) {
					ctx.ui.notify("Cannot remove the main worktree.", "error");
					return;
				}

				if (path.resolve(target) === path.resolve(repoRoot)) {
					ctx.ui.notify("Cannot remove the current worktree. Switch to another with /wt cd first.", "error");
					return;
				}

				const rmArgs = ["worktree", "remove", ...(force ? ["--force"] : []), target];
				const removed = await runGit(repoRoot, rmArgs);

				if (removed.code !== 0) {
					ctx.ui.notify(oneLine(removed.stderr) || "Failed to remove worktree.", "error");
					await refreshWorktreeStatus(ctx);
					return;
				}

				ctx.ui.notify(`Removed worktree: ${target}`, "success");
				await refreshWorktreeStatus(ctx);
				return;
			}

			ctx.ui.notify(`Unknown subcommand: ${cmd}. Try /wt help`, "error");
			await refreshWorktreeStatus(ctx);
		},
	});

	pi.on("session_start", async (_event, ctx) => {
		await refreshWorktreeStatus(ctx);
	});

	pi.on("turn_end", async (_event, ctx) => {
		await refreshWorktreeStatus(ctx);
	});
}
