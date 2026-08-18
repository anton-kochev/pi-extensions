const PLAN_FADE_INTERVAL_MS = 180;
const PLAN_FADE_COLORS = ["accent", "muted", "dim", "muted"] as const;
const GRAPHEME_SEGMENTER = new Intl.Segmenter(undefined, { granularity: "grapheme" });

type PlanStatusColor = "accent" | "muted" | "dim";

type PlanStatusTheme = {
	fg(color: PlanStatusColor, text: string): string;
};

type PlanStatusTUI = {
	requestRender(): void;
};

type PlanFooter = {
	render(width: number): string[];
	invalidate(): void;
	dispose(): void;
};

export type PlanAnimationScheduler = (tick: () => void, intervalMs: number) => () => void;

type PlanFooterFactory = (tui: PlanStatusTUI, theme: PlanStatusTheme, footerData: unknown) => PlanFooter;

export type PlanStatusUI = {
	theme?: PlanStatusTheme;
	setStatus?(key: string, text: string | undefined): void;
	setFooter?(factory: PlanFooterFactory | undefined): void;
};

const schedulePlanAnimation: PlanAnimationScheduler = (tick, intervalMs) => {
	const timer = setInterval(tick, intervalMs);
	timer.unref();
	return () => clearInterval(timer);
};

function sanitizeSessionName(name: string | undefined): string {
	return (name ?? "")
		.replace(/\u001b\[[0-?]*[ -/]*[@-~]/gu, "")
		.replace(/[\p{Cc}\p{Zl}\p{Zp}]+/gu, " ")
		.replace(/\s+/gu, " ")
		.trim();
}

function isFullWidthCodePoint(codePoint: number): boolean {
	return codePoint >= 0x1100 && (
		codePoint <= 0x115f
		|| codePoint === 0x2329
		|| codePoint === 0x232a
		|| (codePoint >= 0x2e80 && codePoint <= 0xa4cf && codePoint !== 0x303f)
		|| (codePoint >= 0xac00 && codePoint <= 0xd7a3)
		|| (codePoint >= 0xf900 && codePoint <= 0xfaff)
		|| (codePoint >= 0xfe10 && codePoint <= 0xfe19)
		|| (codePoint >= 0xfe30 && codePoint <= 0xfe6f)
		|| (codePoint >= 0xff00 && codePoint <= 0xff60)
		|| (codePoint >= 0xffe0 && codePoint <= 0xffe6)
		|| (codePoint >= 0x20000 && codePoint <= 0x3fffd)
	);
}

function graphemeWidth(grapheme: string): number {
	if (/^(?:\p{Control}|\p{Mark}|\p{Default_Ignorable_Code_Point})+$/u.test(grapheme)) return 0;
	if (/[\p{Extended_Pictographic}\p{Regional_Indicator}]/u.test(grapheme) || grapheme.includes("\ufe0f")) {
		return 2;
	}
	const codePoint = grapheme.codePointAt(0);
	return codePoint !== undefined && isFullWidthCodePoint(codePoint) ? 2 : 1;
}

function truncateToColumns(text: string, maxColumns: number): string {
	let result = "";
	let columns = 0;
	for (const { segment } of GRAPHEME_SEGMENTER.segment(text)) {
		const width = graphemeWidth(segment);
		if (columns + width > maxColumns) break;
		result += segment;
		columns += width;
	}
	return result;
}

export function createAnimatedPlanFooter(
	tui: PlanStatusTUI,
	theme: PlanStatusTheme,
	schedule: PlanAnimationScheduler = schedulePlanAnimation,
	getSessionName: () => string | undefined = () => undefined,
): PlanFooter {
	let frameIndex = 0;
	const stopAnimation = schedule(() => {
		frameIndex = (frameIndex + 1) % PLAN_FADE_COLORS.length;
		tui.requestRender();
	}, PLAN_FADE_INTERVAL_MS);

	return {
		render: (width) => {
			if (width <= 0) return [""];
			const dotColor = PLAN_FADE_COLORS[frameIndex]!;
			const sessionName = sanitizeSessionName(getSessionName());
			const label = truncateToColumns(`● planning${sessionName ? ` · ${sessionName}` : ""}`, width);
			return [theme.fg(dotColor, label.slice(0, 1)) + theme.fg("muted", label.slice(1))];
		},
		invalidate: () => {},
		dispose: stopAnimation,
	};
}

export function updatePlanStatus(
	ui: PlanStatusUI,
	active: boolean,
	getSessionName: () => string | undefined = () => undefined,
): void {
	if (active) {
		ui.setFooter?.((tui, theme) => createAnimatedPlanFooter(tui, theme, schedulePlanAnimation, getSessionName));
		return;
	}

	ui.setFooter?.(undefined);
	ui.setStatus?.("plan-mode", undefined);
}
