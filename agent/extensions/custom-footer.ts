import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { truncateToWidth, visibleWidth } from "@mariozechner/pi-tui";
import { readFileSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import {
	completeFooterMetrics,
	createFooterMetricsState,
	formatFooterMetrics,
	recordFooterDelta,
	resetFooterMetrics,
} from "./lib/agent-team-footer-metrics.ts";

function getProjectPiDir(cwd: string): string {
	return cwd.endsWith("/.pi") || cwd.endsWith("/.pi/") ? cwd : join(cwd, ".pi");
}

function readJsonObject(path: string): Record<string, any> {
	try {
		return JSON.parse(readFileSync(path, "utf-8"));
	} catch {
		return {};
	}
}

function getThinkingLevelFromSettings(cwd: string): string {
	const globalSettings = readJsonObject(join(homedir(), ".pi", "agent", "settings.json"));
	const projectSettings = readJsonObject(join(getProjectPiDir(cwd), "settings.json"));
	const level = projectSettings.defaultThinkingLevel ?? globalSettings.defaultThinkingLevel;
	return typeof level === "string" && level.trim() ? level.trim() : "off";
}

function getContextPct(ctx: any): number {
	const usage = ctx.getContextUsage?.();
	let pct = Number(usage?.percentage);
	if (!Number.isFinite(pct)) {
		const used = Number(usage?.used ?? usage?.input ?? usage?.tokens);
		const limit = Number(usage?.limit ?? usage?.max ?? usage?.contextWindow);
		pct = Number.isFinite(used) && Number.isFinite(limit) && limit > 0 ? (used / limit) * 100 : 0;
	}
	return Math.max(0, Math.min(100, pct));
}

function buildContextBar(pct: number, width = 18): string {
	const filled = Math.max(0, Math.min(width, Math.round((pct / 100) * width)));
	return "▕" + "█".repeat(filled) + "░".repeat(width - filled) + "▏";
}

function shortenCwd(cwd: string): string {
	const home = homedir();
	const normalized = cwd.startsWith(home) ? `~${cwd.slice(home.length)}` : cwd;
	const parts = normalized.split("/").filter(Boolean);
	if (parts.length <= 4) return normalized;
	return `${parts.slice(0, 2).join("/")}/…/${parts.slice(-2).join("/")}`;
}

function getStatuses(rawStatuses: unknown): string[] {
	if (Array.isArray(rawStatuses)) {
		return rawStatuses.filter((s): s is string => typeof s === "string" && s.trim().length > 0);
	}
	if (rawStatuses && typeof rawStatuses === "object") {
		return Object.values(rawStatuses).filter((v): v is string => typeof v === "string" && v.trim().length > 0);
	}
	return [];
}

function fitLeftRight(left: string, right: string, width: number): string {
	const pad = " ".repeat(Math.max(1, width - visibleWidth(left) - visibleWidth(right)));
	return truncateToWidth(left + pad + right, width);
}

function isAgentTeamSession(): boolean {
	return process.argv.some((arg) => arg.includes("agent-team.ts"));
}

export default function (pi: ExtensionAPI) {
	let footerTui: any | null = null;
	let footerCtx: any | null = null;
	let enabled = true;
	let footerMetrics = createFooterMetricsState();
	let footerRefreshTimer: ReturnType<typeof setTimeout> | null = null;
	let footerInstallTimer: ReturnType<typeof setTimeout> | null = null;

	function scheduleFooterRefresh(force = true) {
		if (footerRefreshTimer) clearTimeout(footerRefreshTimer);
		footerRefreshTimer = setTimeout(() => {
			footerRefreshTimer = null;
			if (footerTui?.requestRender) {
				footerTui.requestRender(force);
				return;
			}
			if (footerCtx?.ui?.setStatus) {
				footerCtx.ui.setStatus("__footer__", " ");
				setTimeout(() => footerCtx?.ui?.setStatus?.("__footer__", undefined), 0);
			}
		}, 16);
	}

	function clearFooterTimers() {
		if (footerRefreshTimer) {
			clearTimeout(footerRefreshTimer);
			footerRefreshTimer = null;
		}
		if (footerInstallTimer) {
			clearTimeout(footerInstallTimer);
			footerInstallTimer = null;
		}
	}

	function installFooter(ctx: any) {
		if (!ctx.hasUI) return;
		footerCtx = ctx;

		ctx.ui.setFooter((tui: any, theme: any, footerData: any) => {
			footerTui = tui;
			const unsub = footerData.onBranchChange(() => tui.requestRender());

			return {
				dispose: () => {
					unsub();
					clearFooterTimers();
					if (footerTui === tui) footerTui = null;
					if (footerCtx === ctx) footerCtx = null;
				},
				invalidate() {},
				render(width: number): string[] {
					const pct = getContextPct(ctx);
					const model = ctx.model?.id || "no-model";
					const thinking =
						(ctx as any)?.thinkingLevel ||
						(ctx.model as any)?.thinkingLevel ||
						(ctx.model as any)?.thinking ||
						getThinkingLevelFromSettings(ctx.cwd);

					const branch = footerData.getGitBranch?.();
					const statuses = getStatuses(footerData.getExtensionStatuses?.()).filter((s) => !s.startsWith("__footer__"));
					const metrics = formatFooterMetrics(footerMetrics);
					const cwd = shortenCwd(ctx.cwd);

					const contextColor = pct >= 90 ? "error" : pct >= 75 ? "warning" : "success";
					const left =
						theme.fg("accent", "● ") +
						theme.fg("text", model) +
						theme.fg("dim", ` [${thinking}]`) +
						theme.fg("muted", " · ") +
						theme.fg("dim", metrics);
					let right =
						theme.fg(contextColor, buildContextBar(pct)) +
						theme.fg("dim", ` ${Math.round(pct)}%`);
					if (branch) {
						right += theme.fg("dim", " │ ") + theme.fg("accent", "⎇ ") + theme.fg("success", branch);
					}
					right += theme.fg("dim", " │ ") + theme.fg("text", cwd);
					if (statuses.length > 0 && width > 120) {
						right += theme.fg("dim", " │ ") + theme.fg("muted", statuses.join(" · "));
					}
					return [fitLeftRight(left, right, width)];
				},
			};
		});
	}

	function installFooterSoon(ctx: any) {
		clearFooterTimers();
		footerInstallTimer = setTimeout(() => {
			footerInstallTimer = null;
			ctx.ui.setFooter(undefined);
			installFooter(ctx);
			scheduleFooterRefresh();
		}, 50);
	}

	pi.registerCommand("footer", {
		description: "Toggle the standalone custom footer",
		handler: async (_args, ctx) => {
			if (isAgentTeamSession()) {
				ctx.ui.notify("Agent Team manages its own footer", "info");
				return;
			}
			enabled = !enabled;
			if (!ctx.hasUI) return;
			if (enabled) {
				installFooterSoon(ctx);
				ctx.ui.notify("Custom footer enabled", "info");
			} else {
				clearFooterTimers();
				ctx.ui.setFooter(undefined);
				ctx.ui.notify("Default footer restored", "info");
			}
		},
	});

	pi.on("message_start", async (event: any) => {
		if (event?.message?.role !== "assistant") return;
		if (enabled && footerCtx && !footerTui) installFooterSoon(footerCtx);
		footerMetrics = resetFooterMetrics(
			typeof event?.message?.timestamp === "number" ? event.message.timestamp : Date.now(),
		);
		scheduleFooterRefresh(false);
	});

	pi.on("message_update", async (event: any) => {
		if (event?.message?.role !== "assistant") return;
		footerMetrics = recordFooterDelta(footerMetrics, event?.assistantMessageEvent, Date.now());
		scheduleFooterRefresh(false);
	});

	pi.on("message_end", async (event: any) => {
		if (event?.message?.role !== "assistant") return;
		footerMetrics = completeFooterMetrics(footerMetrics, event?.message?.usage, Date.now());
		scheduleFooterRefresh(false);
	});

	pi.on("session_start", async (_event, ctx) => {
		if (!ctx.hasUI || !enabled || isAgentTeamSession()) return;
		installFooterSoon(ctx);
	});
}
