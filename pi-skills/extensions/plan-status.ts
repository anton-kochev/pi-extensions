type PlanStatusTheme = {
	fg(color: "accent" | "muted", text: string): string;
};

type PlanFooter = {
	render(width: number): string[];
	invalidate(): void;
};

type PlanFooterFactory = (tui: unknown, theme: PlanStatusTheme, footerData: unknown) => PlanFooter;

export type PlanStatusUI = {
	theme?: PlanStatusTheme;
	setStatus?(key: string, text: string | undefined): void;
	setFooter?(factory: PlanFooterFactory | undefined): void;
};

export function updatePlanStatus(ui: PlanStatusUI, active: boolean): void {
	if (active) {
		ui.setFooter?.((_tui, theme) => ({
			render: (width) => {
				if (width <= 0) return [""];
				const label = "● planning".slice(0, width);
				return [theme.fg("accent", label.slice(0, 1)) + theme.fg("muted", label.slice(1))];
			},
			invalidate: () => {},
		}));
		return;
	}

	ui.setFooter?.(undefined);
	ui.setStatus?.("plan-mode", undefined);
}
