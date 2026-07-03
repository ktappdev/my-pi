/**
 * BTW — Side-channel Background Assistant
 * 
 * A lightweight background assistant with live streaming overlay. Ask quick
 * questions, run exploratory tasks, or plan without cluttering your main
 * conversation thread.
 * 
 * ─────────────────────────────────────────────────────────────────
 * FEATURES
 * ─────────────────────────────────────────────────────────────────
 * 
 * ✦ Live Streaming Overlay    — Watch responses stream in real-time
 * ✦ Scrolling Transcript      — ↑↓ / PageUp/PageDown to scroll history
 * ✦ Persistent Processes      — Close the overlay; the process keeps running
 * ✦ Project Context Aware     — Gets context from main conversation
 * ✦ Shared Model Config       — Uses /agents-models "Subagents" setting
 * ✦ Session Persistence       — Kept results survive session switches
 * ✦ Keep / Inject / Discard   — Choose what to do with results on completion
 * 
 * ─────────────────────────────────────────────────────────────────
 * COMMANDS
 * ─────────────────────────────────────────────────────────────────
 * 
 *   /btw <task>              — Start BTW with a task, opens overlay
 *   /btw                      — Open overlay (reconnect to running or view result)
 *   /btwlist                  — List kept results, pick one to inject
 *   /btwclear                 — Kill process and clear state
 * 
 * ─────────────────────────────────────────────────────────────────
 * SETUP
 * ─────────────────────────────────────────────────────────────────
 * 
 * Configure the model via: /agents-models → Subagents
 * The BTW shares this setting with the Subagent Widget.
 * 
 * ─────────────────────────────────────────────────────────────────
 * 
 * Author:  Ken Taylor
 * GitHub:  https://github.com/ktappdev
 * Version: 1.0.0
 * 
 */

import {
	Container,
	Input,
	Key,
	Markdown,
	matchesKey,
	truncateToWidth,
	visibleWidth,
	type Focusable,
	type OverlayHandle,
	type TUI,
} from "@mariozechner/pi-tui";
import { Type } from "@sinclair/typebox";
import { spawn } from "child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

const { applyExtensionDefaults } = await import("./themeMap.ts") as any;
import { 
  getGlobalAgentModelsPath, 
  getProjectAgentModelsPath,
  getGlobalAgentThinkingPath,
  getProjectAgentThinkingPath,
  readAgentYamlMap,
} from "./lib/agent-team-config.ts";
import { existsSync } from "fs";
import { buildSessionContext } from "@mariozechner/pi-coding-agent";

const BTW_RESULT_TYPE = "btw-result";

const BTW_SYSTEM_PROMPT = [
	"You are BTW, a background side-channel assistant.",
	"You have the same filesystem access and context as the main agent.",
	"Be direct, practical, and focused. Complete the task thoroughly.",
].join(" ");

interface BtwState {
	// Identity
	id: number;

	// Process
	proc?: ReturnType<typeof spawn>;
	status: "idle" | "running" | "done" | "error";
	sessionFile: string;

	// Streaming
	task: string;
	textChunks: string[];
	toolCount: number;
	elapsed: number;

	// Overlay
	overlayOpen: boolean;
	overlayHandle?: OverlayHandle;
	overlayRefresh?: () => void;
	overlayClose?: () => void;
	clearInput?: () => void;
	scrollReset?: () => void;
	draft: string;

	// Completion flow
	pendingChoice: boolean;
	resultText: string;
}

let btwState: BtwState | null = null;
let nextId = 1;

const BTW_DIR = path.join(os.homedir(), ".pi", "agent", "sessions", "btw");

// ── Helpers ───────────────────────────────────────────────────────────────────

// ── Helpers ───────────────────────────────────────────────────────────────────


export default function (pi: ExtensionAPI) {
function makeSessionFile(): string {
	fs.mkdirSync(BTW_DIR, { recursive: true });
	return path.join(BTW_DIR, `btw-${Date.now()}.jsonl`);
}

function getConfiguredModel(ctx: any): { model: string; thinking: string } {
	// Load from /agents-models config (same as subagent uses)
	const globalModelsPath = getGlobalAgentModelsPath();
	const projectModelsPath = getProjectAgentModelsPath(ctx?.cwd || process.cwd());
	const globalThinkingPath = getGlobalAgentThinkingPath();
	const projectThinkingPath = getProjectAgentThinkingPath(ctx?.cwd || process.cwd());
	
	const globalModels = existsSync(globalModelsPath) ? readAgentYamlMap(globalModelsPath) : {};
	const projectModels = existsSync(projectModelsPath) ? readAgentYamlMap(projectModelsPath) : {};
	const modelConfig = { ...globalModels, ...projectModels };
	
	const globalThinking = existsSync(globalThinkingPath) ? readAgentYamlMap(globalThinkingPath) : {};
	const projectThinking = existsSync(projectThinkingPath) ? readAgentYamlMap(projectThinkingPath) : {};
	const thinkingConfig = { ...globalThinking, ...projectThinking };
	
	// Use "subagents" key — shared with subagent
	const model = modelConfig["subagents"] || (ctx?.model ? `${ctx.model.provider}/${ctx.model.id}` : "openrouter/google/gemini-3-flash-preview");
	const thinking = thinkingConfig["subagents"] || "off";
	
	return { model, thinking };
}

function buildProjectContext(ctx: any): string {
	try {
		if (!ctx.sessionManager) return "";
		const context = buildSessionContext(ctx.sessionManager.getEntries(), ctx.sessionManager.getLeafId());
		// Format as a prompt prefix that gives context
		const messages = context.messages.slice(-10); // Last 10 messages for context
		if (messages.length === 0) return "";
		
		let contextText = "Recent conversation context:\n";
		for (const msg of messages) {
			const role = msg.role === "user" ? "You" : "Assistant";
			const content = Array.isArray(msg.content) 
				? msg.content.map((c: any) => c.type === "text" ? c.text : "").join("")
				: msg.content;
			contextText += `\n${role}: ${String(content).slice(0, 500)}\n`;
		}
		contextText += "\n---\n";
		return contextText;
	} catch {
		return "";
	}
}

function renderMarkdownLines(text: string, width: number, theme: any): string[] {
	if (!text) return [];
	try {
		const md = new (Markdown as any)(text, 0, 0, theme);
		return md.render(width);
	} catch {
		return text.split("\n").flatMap((line) => {
			if (!line) return [""];
			const wrapped: string[] = [];
			for (let i = 0; i < line.length; i += width) {
				wrapped.push(line.slice(i, i + width));
			}
			return wrapped.length > 0 ? wrapped : [""];
		});
	}
}

// ── Overlay rendering ────────────────────────────────────────────────────────

class BtwOverlay extends Container implements Focusable {
	private readonly input: Input;
	private readonly tui: TUI;
	private readonly theme: any;
	private readonly getTranscript: (width: number, theme: any) => string[];
	private readonly getStatus: () => string;
	private readonly onSubmit: (value: string) => void;
	private readonly onDismiss: () => void;
	private _focused = false;
	protected scrollOffset = 0;
	protected maxScrollOffset = 0;
	protected _state: BtwState;
	protected _choiceCallback: ((choice: string) => void) | null = null;
	protected selectedChoice = 0;

	get focused(): boolean {
		return this._focused;
	}

	set focused(value: boolean) {
		this._focused = value;
		this.input.focused = value;
	}

	constructor(
		tui: TUI,
		theme: any,
		getTranscript: (width: number, theme: any) => string[],
		getStatus: () => string,
		onSubmit: (value: string) => void,
		onDismiss: () => void,
		state: BtwState,
	) {
		super();
		this.tui = tui;
		this.theme = theme;
		this.getTranscript = getTranscript;
		this.getStatus = getStatus;
		this.onSubmit = onSubmit;
		this.onDismiss = onDismiss;
		this._state = state;

		this.input = new Input();
		this.input.onSubmit = (value) => this.onSubmit(value);
		this.input.onEscape = () => this.onDismiss();
	}

	handleInput(data: string): void {
		// In choice mode — only handle navigation + confirm/cancel
		if (this._state.pendingChoice) {
			if (matchesKey(data, Key.up) || matchesKey(data, "k")) {
				this.selectedChoice = Math.max(0, this.selectedChoice - 1);
				this.tui.requestRender();
				return;
			}
			if (matchesKey(data, Key.down) || matchesKey(data, "j")) {
				this.selectedChoice = Math.min(2, this.selectedChoice + 1);
				this.tui.requestRender();
				return;
			}
			if (matchesKey(data, Key.enter)) {
				if (this._choiceCallback) {
					const choices = ["Keep for later", "Inject into main chat", "Discard"];
					this._choiceCallback(choices[this.selectedChoice]);
					this._state.pendingChoice = false;
					this._choiceCallback = null;
					this.selectedChoice = 0;
				}
				return;
			}
			if (matchesKey(data, Key.escape)) {
				this.onDismiss();
				return;
			}
			// Swallow all other keys in choice mode
			return;
		}

		// Normal mode — scrolling + input
		if (matchesKey(data, Key.up) || matchesKey(data, "k")) {
			this.scrollOffset = Math.max(0, this.scrollOffset - 1);
			this.tui.requestRender();
			return;
		}
		if (matchesKey(data, Key.down) || matchesKey(data, "j")) {
			this.scrollOffset = Math.min(this.maxScrollOffset, this.scrollOffset + 1);
			this.tui.requestRender();
			return;
		}
		if (matchesKey(data, Key.pageUp)) {
			this.scrollOffset = Math.max(0, this.scrollOffset - 5);
			this.tui.requestRender();
			return;
		}
		if (matchesKey(data, Key.pageDown)) {
			this.scrollOffset = Math.min(this.maxScrollOffset, this.scrollOffset + 5);
			this.tui.requestRender();
			return;
		}

		// Submit on Enter
		if (matchesKey(data, Key.enter)) {
			this.onSubmit(this.input.getValue());
			return;
		}

		// Escape closes overlay
		if (matchesKey(data, Key.escape)) {
			this.onDismiss();
			return;
		}

		this.input.handleInput(data);
	}

	setDraft(value: string): void {
		this.input.setValue(value);
		this.tui.requestRender();
	}

	getDraft(): string {
		return this.input.getValue();
	}

	public clearInput(): void {
		this.input.setValue("");
	}

	public setChoiceCallback(cb: ((choice: string) => void) | null): void {
		this._choiceCallback = cb;
	}

	private frameLine(content: string, innerWidth: number): string {
		const truncated = truncateToWidth(content, innerWidth, "");
		const padding = Math.max(0, innerWidth - visibleWidth(truncated));
		return `${this.theme.fg("border", "│")}${truncated}${" ".repeat(padding)}${this.theme.fg("border", "│")}`;
	}

	private borderLine(innerWidth: number, edge: "top" | "bottom"): string {
		const left = edge === "top" ? "┌" : "└";
		const right = edge === "top" ? "┐" : "┘";
		return this.theme.fg("border", `${left}${"─".repeat(innerWidth)}${right}`);
	}

	override render(width: number): string[] {
		const dialogWidth = Math.max(56, Math.min(width, Math.floor(width * 0.9)));
		const innerWidth = Math.max(40, dialogWidth - 2);
		const terminalRows = process.stdout.rows ?? 30;
		const dialogHeight = Math.max(16, Math.min(30, Math.floor(terminalRows * 0.75)));
		const chromeHeight = 7;
		const choiceHeight = this._state.pendingChoice ? 6 : 0;
		const transcriptHeight = Math.max(6, dialogHeight - chromeHeight - choiceHeight);

		const transcript = this.getTranscript(innerWidth, this.theme);
		this.maxScrollOffset = Math.max(0, transcript.length - transcriptHeight);
		if (this._state.pendingChoice) {
			this.scrollOffset = this.maxScrollOffset;
		}
		const startIdx = Math.max(0, transcript.length - transcriptHeight - this.scrollOffset);
		const visibleTranscript = transcript.slice(startIdx, startIdx + transcriptHeight);
		const transcriptPadding = Math.max(0, transcriptHeight - visibleTranscript.length);

		const status = this.getStatus();

		const prevFocused = this.input.focused;
		this.input.focused = false;
		const inputLine = this.input.render(innerWidth)[0] ?? "";
		this.input.focused = prevFocused;

		const lines = [
			this.borderLine(innerWidth, "top"),
			this.frameLine(this.theme.fg("accent", this.theme.bold(" BTW ")) + this.theme.fg("dim", "background assistant"), innerWidth),
			this.frameLine(
				this.theme.fg("dim", `Esc close · ↑↓ scroll${this.maxScrollOffset > 0 ? ` (${this.scrollOffset}/${this.maxScrollOffset})` : ""}`),
				innerWidth
			),
			this.theme.fg("border", `├${"─".repeat(innerWidth)}┤`),
		];

		for (const line of visibleTranscript) {
			lines.push(this.frameLine(line, innerWidth));
		}
		for (let i = 0; i < transcriptPadding; i++) {
			lines.push(this.frameLine("", innerWidth));
		}

		lines.push(this.theme.fg("border", `├${"─".repeat(innerWidth)}┤`));
		lines.push(this.frameLine(this.theme.fg("warning", status), innerWidth));

		if (this._state.pendingChoice) {
			const choices = ["Keep for later", "Inject into main chat", "Discard"];
			lines.push(this.theme.fg("border", `├${"─".repeat(innerWidth)}┤`));
			lines.push(this.frameLine(this.theme.fg("dim", "BTW complete — choose what to do:"), innerWidth));
			for (let i = 0; i < choices.length; i++) {
				const marker = i === this.selectedChoice ? this.theme.fg("error", "▶ ") : this.theme.fg("dim", "  ");
				const text = i === this.selectedChoice ? this.theme.fg("error", this.theme.bold(choices[i])) : this.theme.fg("dim", choices[i]);
				lines.push(this.frameLine(marker + text, innerWidth));
			}
			lines.push(this.frameLine(this.theme.fg("dim", "↑↓ select · Enter confirm · Esc discard"), innerWidth));
		} else {
			lines.push(`${this.theme.fg("border", "│")}${inputLine}${this.theme.fg("border", "│")}`);
			lines.push(this.frameLine(this.theme.fg("dim", "Enter submit · Esc close overlay"), innerWidth));
		}

		lines.push(this.borderLine(innerWidth, "bottom"));

		return lines;
	}
}

// ── Overlay helpers ───────────────────────────────────────────────────────────

function scheduleRefresh(state: BtwState): void {
	if (state.overlayRefresh) {
		state.overlayRefresh();
	}
}

function openOverlay(state: BtwState, ctx: any): void {
	if (state.overlayOpen && state.overlayHandle) {
		state.overlayHandle.setHidden(false);
		state.overlayHandle.focus();
		scheduleRefresh(state);
		return;
	}

	const closeRuntime = () => {
		state.overlayOpen = false;
		state.overlayHandle?.hide();
		state.overlayHandle = undefined;
		state.overlayRefresh = undefined;
		state.overlayClose = undefined;
	};
	state.overlayClose = closeRuntime;

	void ctx.ui
		.custom<void>(
			async (tui, theme, keybindings, done) => {
				state.overlayClose = () => {
					closeRuntime();
					done();
				};

				const overlay = new BtwOverlay(
					tui,
					theme,
					(w, t) => getTranscriptLines(state!, w, t),
					() => getStatusText(state!),
					(value) => {
						handleOverlaySubmit(state!, value, ctx);
					},
					() => {
						// Dismiss overlay — process keeps running in background
						state!.overlayOpen = false;
						state!.overlayHandle?.hide();
						state!.overlayHandle = undefined;
						state!.overlayRefresh = undefined;
						state!.overlayClose = undefined;
						if (state!.pendingChoice && state!.status !== "running") {
							// Defer showClosePrompt so overlay keybindings are fully released first
							setTimeout(() => {
								if (state!.status !== "running") {
									void showClosePrompt(state!, ctx);
								}
							}, 0);
						}
					},
					state!,
				);

				overlay.focused = true;
				overlay.setDraft(state.draft);
				state.overlayRefresh = () => {
					overlay.focused = state.overlayHandle?.isFocused() ?? false;
					tui.requestRender();
				};
				(state as any)._setOverlayCallback = (cb: any) => {
					overlay.setChoiceCallback(cb);
				};
				state.clearInput = () => overlay.clearInput();
				state.scrollReset = () => {
					overlay.scrollOffset = 0;
					overlay.maxScrollOffset = 0;
					tui.requestRender();
				};

				return overlay;
			},
			{
				overlay: true,
				overlayOptions: {
					width: "80%",
					minWidth: 72,
					maxHeight: "78%",
					anchor: "top-center",
					margin: { top: 2, bottom: 2, left: 4, right: 4 },
				},
				onHandle: (handle) => {
					state.overlayOpen = true;
					state.overlayHandle = handle;
					handle.focus();
				},
			},
		)
		.catch((error) => {
			state.overlayOpen = false;
			ctx.ui.notify(`BTW overlay error: ${error instanceof Error ? error.message : String(error)}`, "error");
		});
}

function getTranscriptLines(state: BtwState, width: number, theme: any): string[] {
	const lines: string[] = [];
	const statusColor = state.status === "running" ? "accent" : state.status === "done" ? "success" : state.status === "error" ? "error" : "dim";
	const statusIcon = state.status === "running" ? "●" : state.status === "done" ? "✓" : state.status === "error" ? "✗" : "○";

	if (state.task) {
		const taskPreview = state.task.length > 60 ? state.task.slice(0, 57) + "..." : state.task;
		lines.push(theme.fg(statusColor, `${statusIcon} ${statusIcon !== "○" ? theme.bold(state.status.toUpperCase()) : ""} BTW`) + theme.fg("dim", ` · ${Math.round(state.elapsed / 1000)}s · Tools: ${state.toolCount}`));
		lines.push("");
		lines.push(theme.fg("accent", theme.bold("Task: ")) + truncateToWidth(state.task, width - 6, "…"));
		lines.push("");
	}

	if (state.textChunks.length === 0) {
		if (state.status === "running") {
			lines.push(theme.fg("dim", "Processing…"));
		} else if (state.status === "idle") {
			lines.push(theme.fg("dim", "Type your request below and press Enter."));
		} else if (state.status === "done" || state.status === "error") {
			lines.push(theme.fg("dim", "(No output yet)"));
		}
		return lines;
	}

	const fullText = state.textChunks.join("");
	const textLines = fullText.split("\n");
	const visibleLines = textLines.slice(-40);
	const lastLines = visibleLines.map((l) => {
		const trimmed = truncateToWidth(l, width - 2, "…");
		return theme.fg("text", ` ${trimmed}`);
	});

	lines.push(...lastLines);

	if (textLines.length > 40) {
		lines.unshift(theme.fg("dim", `  … (${textLines.length - 40} more lines above)`));
	}

	return lines;
}

function getStatusText(state: BtwState): string {
	switch (state.status) {
		case "idle":
			return state.task ? `Ready · ${state.toolCount} tools used` : "Ready";
		case "running":
			return `Running · ${Math.round(state.elapsed / 1000)}s elapsed · ${state.toolCount} tools`;
		case "done":
			return state.pendingChoice ? "Done — choose what to do with the result" : "Done";
		case "error":
			return "Error occurred";
	}
}

// ── Child process management ─────────────────────────────────────────────────

function processLine(state: BtwState, line: string): void {
	if (!line.trim()) return;
	try {
		const event = JSON.parse(line);
		const type = event.type;

		if (type === "message_update") {
			const delta = event.assistantMessageEvent;
			if (delta?.type === "text_delta") {
				state.textChunks.push(delta.delta || "");
				scheduleRefresh(state);
			}
		} else if (type === "tool_execution_start") {
			state.toolCount++;
			scheduleRefresh(state);
		}
	} catch {
		// Non-JSON line — append as-is (e.g. stderr)
		state.textChunks.push(line);
		scheduleRefresh(state);
	}
}

function startChildProcess(state: BtwState, prompt: string, ctx: any): void {
	const { model, thinking } = getConfiguredModel(ctx);
	const projectContext = buildProjectContext(ctx);
	const fullPrompt = projectContext + prompt;

	const proc = spawn("pi", [
		"--mode", "json",
		"-p",
		"--session", state.sessionFile,
		"--no-extensions",
		"--model", model,
		"--tools", "read,bash,grep,find,ls",
		"--thinking", thinking,
		fullPrompt,
	], {
		stdio: ["ignore", "pipe", "pipe"],
		env: { ...process.env },
	});

	state.proc = proc;

	const startTime = Date.now();
	const timer = setInterval(() => {
		state.elapsed = Date.now() - startTime;
		scheduleRefresh(state);
	}, 1000);

	let buffer = "";

	proc.stdout!.setEncoding("utf-8");
	proc.stdout!.on("data", (chunk: string) => {
		buffer += chunk;
		const lines = buffer.split("\n");
		buffer = lines.pop() || "";
		for (const line of lines) processLine(state, line);
	});

	proc.stderr!.setEncoding("utf-8");
	proc.stderr!.on("data", (chunk: string) => {
		if (chunk.trim()) {
			state.textChunks.push(chunk);
			scheduleRefresh(state);
		}
	});

	proc.on("close", (code) => {
		if (buffer.trim()) processLine(state, buffer);
		clearInterval(timer);
		state.elapsed = Date.now() - startTime;
		state.status = code === 0 ? "done" : "error";
		state.proc = undefined;

		const result = state.textChunks.join("").trim();
		state.resultText = result;

		if (state.overlayOpen && state.overlayHandle) {
			// Overlay is open — show close prompt immediately
			showClosePrompt(state, ctx);
		} else {
			// Overlay is closed — mark pending so it shows on next open
			state.pendingChoice = true;
			ctx.ui.notify("BTW complete. Re-open with /btw to choose what to do with the result.", "info");
		}

		scheduleRefresh(state);
	});

	proc.on("error", (err) => {
		clearInterval(timer);
		state.status = "error";
		state.proc = undefined;
		state.textChunks.push(`Error: ${err.message}`);
		state.resultText = `Error: ${err.message}`;
		state.pendingChoice = true;
		scheduleRefresh(state);
		ctx.ui.notify(`BTW error: ${err.message}`, "error");
	});
}

function stopChildProcess(state: BtwState): void {
	if (state.proc && state.status === "running") {
		state.proc.kill("SIGTERM");
		state.proc = undefined;
		state.status = "idle";
	}
}

// ── Completion flow ───────────────────────────────────────────────────────────

async function showClosePrompt(state: BtwState, ctx: any): Promise<void> {
	state.pendingChoice = false;

	const handleChoice = (choice: string) => {
		if (choice === "Keep for later") {
			pi.appendEntry(BTW_RESULT_TYPE, {
				task: state.task,
				result: state.resultText,
				timestamp: Date.now(),
				id: state.id,
			});
			ctx.ui.notify("BTW result kept. Use /btwlist to inject it.", "success");
			resetState(state);
		} else if (choice === "Inject into main chat") {
			void injectResultIntoMain(state, ctx);
			resetState(state);
		} else {
			ctx.ui.notify("BTW result discarded.", "info");
			resetState(state);
		}
	};

	if (state.overlayHandle) {
		state.pendingChoice = true;
		(state as any)._setOverlayCallback?.(handleChoice);
		scheduleRefresh(state);
		return;
	}

	const choice = await ctx.ui.select("BTW complete:", ["Keep for later", "Inject into main chat", "Discard"]);
	handleChoice(choice);
}

async function injectResultIntoMain(state: BtwState, ctx: any): Promise<void> {
	const summary = state.resultText.slice(0, 6000) + (state.resultText.length > 6000 ? "\n\n… [truncated]" : "");
	const message = `BTW result for "${state.task}":\n\n${summary}`;

	if (ctx.isIdle?.()) {
		pi.sendUserMessage(message);
	} else {
		pi.sendUserMessage(message, { deliverAs: "followUp" });
	}

	ctx.ui.notify("BTW result injected into main chat.", "info");
}

function resetState(state?: BtwState): void {
	const s = state ?? btwState;
	if (!s) return;

	if (s.proc && s.status === "running") {
		s.proc.kill("SIGTERM");
	}
	if (s.overlayHandle) {
		s.overlayHandle.hide();
	}

	s.status = "idle";
	s.proc = undefined;
	s.task = "";
	s.textChunks = [];
	s.toolCount = 0;
	s.elapsed = 0;
	s.overlayOpen = false;
	s.overlayHandle = undefined;
	s.overlayRefresh = undefined;
	s.overlayClose = undefined;
	s.clearInput = undefined;
	s.scrollReset = undefined;
	s.draft = "";
	s.pendingChoice = false;
	s.resultText = "";
}

function getOrCreateState(): BtwState {
	if (btwState) return btwState;

	btwState = {
		id: nextId++,
		status: "idle",
		sessionFile: makeSessionFile(),
		task: "",
		textChunks: [],
		toolCount: 0,
		elapsed: 0,
		overlayOpen: false,
		draft: "",
		pendingChoice: false,
		resultText: "",
	};

	return btwState;
}

// ── Overlay submit handler ────────────────────────────────────────────────────

function handleOverlaySubmit(state: BtwState, value: string, ctx: any): void {
	const prompt = value.trim();
	if (!prompt) return;

	state.draft = "";
	state.status = "running";
	state.task = prompt;
	state.textChunks = [];
	state.toolCount = 0;
	state.elapsed = 0;
	state.pendingChoice = false;
	state.resultText = "";

	startChildProcess(state, prompt, ctx);
	state.clearInput?.();
	state.scrollReset?.();
}

// ── Restore kept results from session ────────────────────────────────────────

async function restoreKeptResults(ctx: any): Promise<void> {
	// Kept results are read from session tree and displayed when /btw is called
	// with no active BTW. We don't restore the process itself — only the stored results.
	// The state is kept in memory; session entries are for informational display.
}

// ── Extension registration ─────────────────────────────────────────────────────

	// ── /btw ──────────────────────────────────────────────────────────────────

	pi.registerCommand("btw", {
		description: "BTW background assistant: /btw <task> — opens overlay and spawns child process",
		handler: async (args, ctx) => {
			const prompt = args.trim();

			// Check for pending choice FIRST — show close prompt before doing anything else
			if (btwState?.pendingChoice && btwState.status !== "running") {
				await showClosePrompt(btwState, ctx);
				if (btwState.status === "idle") return; // user discarded, don't continue
			}

			if (!prompt) {
				// No args — show/open overlay for current state
				const state = getOrCreateState();

				if (state.pendingChoice && (state.status === "done" || state.status === "error")) {
					// Show close prompt if process completed while overlay was closed
					openOverlay(state, ctx);
					// Small delay so overlay renders before prompt appears
					setTimeout(() => showClosePrompt(state, ctx), 100);
					return;
				}

				if (state.status === "running") {
					// Show running overlay
					openOverlay(state, ctx);
					return;
				}

				// Idle — just open the overlay
				openOverlay(state, ctx);
				return;
			}

			// Has args — start a new BTW
			if (btwState && btwState.status === "running") {
				ctx.ui.notify("BTW is already running. Use /btwclear first.", "warning");
				return;
			}

			// Clean up previous state if any
			if (btwState) {
				resetState(btwState);
			}

			const state = getOrCreateState();
			state.task = prompt;
			state.status = "running";
			state.textChunks = [];
			state.toolCount = 0;
			state.elapsed = 0;
			state.pendingChoice = false;
			state.resultText = "";
			state.sessionFile = makeSessionFile();

			openOverlay(state, ctx);
			startChildProcess(state, prompt, ctx);
	state.clearInput?.();
	state.scrollReset?.();
		},
	});


	// ── /btwclear ──────────────────────────────────────────────────────────────

	pi.registerCommand("btwclear", {
		description: "Discard and clear the current BTW state: /btwclear",
		handler: async (args, ctx) => {
			if (!btwState) {
				ctx.ui.notify("No active BTW to clear.", "info");
				return;
			}

			const hadProcess = btwState.status === "running";
			resetState(btwState);

			if (hadProcess) {
				ctx.ui.notify("BTW process killed and state cleared.", "warning");
			} else {
				ctx.ui.notify("BTW state cleared.", "info");
			}
		},
	});

	// ── /btwlist ──────────────────────────────────────────────────────────────

	pi.registerCommand("btwlist", {
		description: "List kept BTW results from this session: /btwlist",
		handler: async (args, ctx) => {
			const branch = ctx.sessionManager?.getBranch?.() ?? [];
			const results: any[] = [];

			for (const entry of branch) {
				if (entry.type === "custom" && entry.customType === BTW_RESULT_TYPE) {
					results.push(entry.data);
				}
			}

			if (results.length === 0) {
				ctx.ui.notify("No kept BTW results in this session.", "info");
				return;
			}

			// Build select options from most recent to oldest
			const options = results.map((r, i) => {
				const ts = new Date(r.timestamp).toLocaleTimeString();
				const preview = r.task?.slice(0, 60) ?? "(no task)";
				const label = r.task?.length > 60 ? preview + "…" : preview;
				return `[${ts}] ${label}`;
			});
			options.push("Cancel");

			const choice = await ctx.ui.select("Select BTW result to inject:", options);
			
			if (choice === undefined || choice === "Cancel") {
				return;
			}

			// Find the selected result
			const index = options.indexOf(choice);
			if (index < 0 || index >= results.length) {
				return;
			}

			const selected = results[index];
			const summary = selected.result?.slice(0, 6000) + (selected.result?.length > 6000 ? "\n\n… [truncated]" : "");
			const message = `BTW result for "${selected.task}":\n\n${summary}`;

			if (ctx.isIdle?.()) {
				pi.sendUserMessage(message);
			} else {
				pi.sendUserMessage(message, { deliverAs: "followUp" });
			}

			// Remove the injected entry from session
			const entries = ctx.sessionManager?.getEntries?.() ?? [];
			for (let i = entries.length - 1; i >= 0; i--) {
				const entry = entries[i];
				if (entry.type === "custom" && entry.customType === BTW_RESULT_TYPE && entry.data?.id === selected.id) {
					ctx.sessionManager?.removeEntry?.(i);
					break;
				}
			}

			ctx.ui.notify("BTW result injected into main chat.", "info");
		},
	});
	// ── Lifecycle ──────────────────────────────────────────────────────────────

	pi.on("session_start", async (_event, ctx) => {
		applyExtensionDefaults?.(import.meta.url, ctx);
		if (btwState) {
			if (btwState.status === "running") {
				btwState.proc?.kill("SIGTERM");
				ctx.ui.notify("BTW process terminated on session switch.", "warning");
			}
			resetState(btwState);
		}
		btwState = null;
		nextId = 1;
	});

	pi.on("session_switch", async (_event, ctx) => {
		if (btwState) {
			if (btwState.status === "running") {
				btwState.proc?.kill("SIGTERM");
			}
			resetState(btwState);
		}
		btwState = null;
		nextId = 1;
	});
}
