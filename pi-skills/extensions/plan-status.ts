const PLAN_FADE_INTERVAL_MS = 180;
const PLAN_FADE_COLORS = ["accent", "muted", "dim", "muted"] as const;

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

export function createAnimatedPlanFooter(
	tui: PlanStatusTUI,
	theme: PlanStatusTheme,
	schedule: PlanAnimationScheduler = schedulePlanAnimation,
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
			const label = "● planning".slice(0, width);
			return [theme.fg(dotColor, label.slice(0, 1)) + theme.fg("muted", label.slice(1))];
		},
		invalidate: () => {},
		dispose: stopAnimation,
	};
}

export function updatePlanStatus(ui: PlanStatusUI, active: boolean): void {
	if (active) {
		ui.setFooter?.((tui, theme) => createAnimatedPlanFooter(tui, theme));
		return;
	}

	ui.setFooter?.(undefined);
	ui.setStatus?.("plan-mode", undefined);
}
