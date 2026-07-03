export interface FooterMetricsUsage {
	input: number;
	output: number;
	totalTokens: number;
}

export interface FooterMetricsState {
	requestStartMs: number | null;
	firstDeltaMs: number | null;
	endMs: number | null;
	streaming: boolean;
	streamedChars: number;
	usage: FooterMetricsUsage | null;
}

interface DeltaEventLike {
	type?: string;
	delta?: unknown;
}

const FIRST_DELTA_TYPES = new Set(["text_delta", "thinking_delta", "toolcall_delta"]);

export function createFooterMetricsState(): FooterMetricsState {
	return {
		requestStartMs: null,
		firstDeltaMs: null,
		endMs: null,
		streaming: false,
		streamedChars: 0,
		usage: null,
	};
}

export function resetFooterMetrics(startMs: number): FooterMetricsState {
	return {
		requestStartMs: startMs,
		firstDeltaMs: null,
		endMs: null,
		streaming: false,
		streamedChars: 0,
		usage: null,
	};
}

export function recordFooterDelta(
	state: FooterMetricsState,
	event: DeltaEventLike,
	now = Date.now(),
): FooterMetricsState {
	if (!FIRST_DELTA_TYPES.has(String(event?.type ?? ""))) {
		return state;
	}

	const deltaLen = typeof event?.delta === "string" ? event.delta.length : 0;

	return {
		...state,
		firstDeltaMs: state.firstDeltaMs ?? now,
		streaming: true,
		streamedChars: state.streamedChars + deltaLen,
	};
}

export function completeFooterMetrics(
	state: FooterMetricsState,
	usage: unknown,
	now = Date.now(),
): FooterMetricsState {
	const usageRecord = usage as { input?: number; output?: number; totalTokens?: number } | null | undefined;
	const inputRaw = usageRecord?.input;
	const outputRaw = usageRecord?.output;
	const totalTokensRaw = usageRecord?.totalTokens;
	const input = Number(inputRaw ?? 0);
	const output = Number(outputRaw ?? 0);
	const totalTokens = Number(totalTokensRaw ?? 0);

	const hasUsage =
		usageRecord != null &&
		(inputRaw !== undefined || outputRaw !== undefined || totalTokensRaw !== undefined);

	return {
		...state,
		endMs: now,
		streaming: false,
		usage: hasUsage
			? {
				input: Number.isFinite(input) ? input : 0,
				output: Number.isFinite(output) ? output : 0,
				totalTokens: Number.isFinite(totalTokens) ? totalTokens : 0,
			}
			: null,
	};
}

export function formatFooterMetrics(state: FooterMetricsState, now = Date.now()): string {
	const ttftMs = getTtftMs(state);
	const genMs = getGenerationMs(state, now);
	const liveRate = getLiveRate(state, now);
	const finalRate = getFinalRate(state, now);

	const ttftText = `ttft:${formatDurationMs(ttftMs)}`;
	const genText = `gen:${formatDurationMs(genMs)}`;
	const rateText = finalRate != null
		? `↓${formatRate(finalRate)} tok/s`
		: liveRate != null
			? `↓~${formatRate(liveRate)} tok/s`
			: "↓-- tok/s";
	const tokenText = state.usage
		? `↑${formatTokenCount(state.usage.input)} ↓${formatTokenCount(state.usage.output)} =${formatTokenCount(state.usage.totalTokens)}`
		: "↑-- ↓-- =--";

	return `${ttftText} · ${genText} · ${rateText} · ${tokenText}`;
}

function getTtftMs(state: FooterMetricsState): number | null {
	if (state.requestStartMs == null || state.firstDeltaMs == null) return null;
	return Math.max(0, state.firstDeltaMs - state.requestStartMs);
}

function getGenerationMs(state: FooterMetricsState, now: number): number | null {
	if (state.firstDeltaMs == null) return null;
	const endMs = state.streaming ? now : state.endMs;
	if (endMs == null) return null;
	return Math.max(0, endMs - state.firstDeltaMs);
}

function getLiveRate(state: FooterMetricsState, now: number): number | null {
	if (!state.streaming || state.streamedChars <= 0) return null;
	const genMs = getGenerationMs(state, now);
	if (genMs == null) return null;
	return (state.streamedChars / 4) / Math.max(0.05, genMs / 1000);
}

function getFinalRate(state: FooterMetricsState, now: number): number | null {
	if (!state.usage || state.usage.output <= 0) return null;
	const genMs = getGenerationMs(state, now);
	if (genMs == null) return null;
	return state.usage.output / Math.max(0.05, genMs / 1000);
}

function formatDurationMs(ms: number | null): string {
	if (ms == null || !Number.isFinite(ms)) return "--";
	const seconds = Math.max(0, ms) / 1000;
	if (seconds < 10) return `${seconds.toFixed(2)}s`;
	if (seconds < 100) return `${seconds.toFixed(1)}s`;
	return `${seconds.toFixed(0)}s`;
}

function formatRate(rate: number): string {
	if (!Number.isFinite(rate) || rate <= 0) return "--";
	if (rate >= 100) return rate.toFixed(0);
	if (rate >= 10) return rate.toFixed(1);
	return rate.toFixed(2);
}

function formatTokenCount(tokens: number): string {
	if (!Number.isFinite(tokens) || tokens < 0) return "--";
	if (tokens >= 1_000_000) {
		const millions = tokens / 1_000_000;
		return `${millions >= 10 ? millions.toFixed(0) : millions.toFixed(1)}m`;
	}
	if (tokens >= 1_000) {
		const thousands = tokens / 1_000;
		return `${thousands >= 10 ? thousands.toFixed(0) : thousands.toFixed(1)}k`;
	}
	return `${Math.round(tokens)}`;
}
