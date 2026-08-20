import { stripVTControlCharacters } from "node:util";
import type {
	ExtensionAPI,
	ExtensionContext,
	ReadonlyFooterDataProvider,
	Theme,
} from "@earendil-works/pi-coding-agent";
import { truncateToWidth, visibleWidth, type Component, type TUI } from "@earendil-works/pi-tui";
import { planModeState } from "./safety.ts";

export interface AtlasFooterSnapshot {
	cwd: string;
	sessionName?: string;
	model?: {
		provider: string;
		id: string;
	};
	thinkingLevel: string;
}

type FooterFactory = Exclude<Parameters<ExtensionContext["ui"]["setFooter"]>[0], undefined>;
type FooterSetter = ExtensionContext["ui"]["setFooter"];
type FooterUI = ExtensionContext["ui"];

const ATLAS_FOOTER_OWNER = Symbol.for("@pithos-kit/atlas.footer-owner");

interface AtlasFooterOwnership {
	active: boolean;
	observedSelection: boolean;
	previousSetter: FooterSetter;
	ui: FooterUI;
	wrapper: FooterSetter;
}

type AtlasOwnedFooterSetter = FooterSetter & {
	[ATLAS_FOOTER_OWNER]?: AtlasFooterOwnership;
};

const TERMINAL_STRING_RE = /(?:\u001b(?:\]|P|X|\^|_)|[\u0090\u0098\u009d\u009e\u009f])[\s\S]*?(?:\u0007|\u001b\\|\u009c|$)/gu;
const TERMINAL_CONTROL_RE = /[\u0000-\u001f\u007f-\u009f]+/gu;

function safeSingleLine(value: string): string {
	return stripVTControlCharacters(value.replace(TERMINAL_STRING_RE, ""))
		.replace(TERMINAL_CONTROL_RE, " ")
		.replace(/ {2,}/gu, " ")
		.trim();
}

export function createAtlasFooter(
	tui: Pick<TUI, "requestRender">,
	theme: Pick<Theme, "fg">,
	footerData: Pick<ReadonlyFooterDataProvider, "getGitBranch" | "getExtensionStatuses" | "onBranchChange">,
	getSnapshot: () => AtlasFooterSnapshot,
): Component & { dispose(): void } {
	const unsubscribe = footerData.onBranchChange(() => tui.requestRender());

	return {
		dispose: unsubscribe,
		invalidate() {},
		render(width: number): string[] {
			const snapshot = getSnapshot();
			const cwd = safeSingleLine(snapshot.cwd);
			const branch = safeSingleLine(footerData.getGitBranch() ?? "");
			const sessionName = safeSingleLine(snapshot.sessionName ?? "");
			const leftText = `${cwd}${branch ? ` (${branch})` : ""}${sessionName ? ` • ${sessionName}` : ""}`;
			const model = snapshot.model;
			const provider = safeSingleLine(model?.provider ?? "no-provider") || "no-provider";
			const modelId = safeSingleLine(model?.id ?? "no-model") || "no-model";
			const thinkingLevel = safeSingleLine(snapshot.thinkingLevel);
			const modelText = `${modelId} • ${thinkingLevel}`;
			const fullRight = theme.fg("dim", `(${provider}) ${modelText}`);
			const compactRight = theme.fg("dim", modelText);
			const right = width > 0 && visibleWidth(fullRight) >= width ? compactRight : fullRight;
			const rightWidth = visibleWidth(right);

			let primaryLine = "";
			if (width > 0 && rightWidth >= width) {
				primaryLine = truncateToWidth(right, width, "");
			} else if (width > 0) {
				const left = truncateToWidth(theme.fg("dim", leftText), Math.max(0, width - rightWidth - 2), theme.fg("dim", "..."));
				const padding = " ".repeat(Math.max(0, width - visibleWidth(left) - rightWidth));
				primaryLine = truncateToWidth(left + padding + right, width, "");
			}

			const statusLines = [...footerData.getExtensionStatuses()]
				.sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey))
				.map(([, status]) => status.replace(/[\r\n\t]+/gu, " ").replace(/ {2,}/gu, " ").trim())
				.map((status) => truncateToWidth(status, width, theme.fg("dim", "...")));
			return [primaryLine, ...statusLines];
		},
	};
}

export function registerAtlasFooter(pi: ExtensionAPI): void {
	let ownedFooter: AtlasFooterOwnership | undefined;

	pi.on("session_start", (_event, ctx) => {
		if (ctx.mode !== "tui") return;

		const inheritedOwner = (ctx.ui.setFooter as AtlasOwnedFooterSetter)[ATLAS_FOOTER_OWNER];
		if (inheritedOwner) inheritedOwner.active = false;
		const previousSetter = inheritedOwner?.previousSetter ?? ctx.ui.setFooter;
		const atlasFactory: FooterFactory = (tui, theme, footerData) => createAtlasFooter(
			tui,
			theme,
			footerData,
			() => ({
				cwd: ctx.cwd,
				sessionName: pi.getSessionName(),
				model: ctx.model ? { provider: ctx.model.provider, id: ctx.model.id } : undefined,
				thinkingLevel: ctx.thinkingLevel ?? "off",
			}),
		);

		let owner: AtlasFooterOwnership;
		const wrapper: FooterSetter = (factory) => {
			if (!owner.active) return;
			owner.observedSelection = true;
			previousSetter.call(ctx.ui, factory ?? atlasFactory);
		};
		owner = {
			active: true,
			observedSelection: false,
			previousSetter,
			ui: ctx.ui,
			wrapper,
		};
		Object.defineProperty(wrapper, ATLAS_FOOTER_OWNER, { value: owner });
		ctx.ui.setFooter = wrapper;
		ownedFooter = owner;

		queueMicrotask(() => {
			if (
				!owner.active
				|| owner.observedSelection
				|| owner.ui.setFooter !== owner.wrapper
				|| planModeState(ctx.sessionManager.getBranch()) !== "inactive"
			) return;
			previousSetter.call(ctx.ui, atlasFactory);
		});
	});

	pi.on("session_shutdown", (_event, ctx) => {
		const owner = ownedFooter;
		if (!owner) return;
		owner.active = false;
		if (ctx.ui === owner.ui && ctx.ui.setFooter === owner.wrapper) {
			ctx.ui.setFooter = owner.previousSetter;
			owner.previousSetter.call(ctx.ui, undefined);
		}
		ownedFooter = undefined;
	});
}
