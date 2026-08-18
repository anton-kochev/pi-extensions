import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createAnimatedPlanFooter, updatePlanStatus } from "../extensions/plan-status.ts";

describe("createAnimatedPlanFooter", () => {
	it("fades a fixed dot out and back in while requesting each render", () => {
		let advance = () => {};
		let intervalMs: number | undefined;
		let renderRequests = 0;
		const footer = createAnimatedPlanFooter(
			{ requestRender: () => renderRequests++ },
			{ fg: (color: string, text: string) => `<${color}>${text}</${color}>` },
			(tick, interval) => {
				advance = tick;
				intervalMs = interval;
				return () => {};
			},
		);

		assert.equal(intervalMs, 180);
		assert.deepEqual(footer.render(80), ["<accent>●</accent><muted> planning</muted>"]);
		advance();
		assert.equal(renderRequests, 1);
		assert.deepEqual(footer.render(80), ["<muted>●</muted><muted> planning</muted>"]);
		advance();
		assert.deepEqual(footer.render(80), ["<dim>●</dim><muted> planning</muted>"]);
		advance();
		assert.deepEqual(footer.render(80), ["<muted>●</muted><muted> planning</muted>"]);
		advance();
		assert.deepEqual(footer.render(80), ["<accent>●</accent><muted> planning</muted>"]);
	});

	it("stops the fade timer when the footer is disposed", () => {
		let stopped = false;
		const footer = createAnimatedPlanFooter(
			{ requestRender: () => {} },
			{ fg: (_color: string, text: string) => text },
			() => () => {
				stopped = true;
			},
		);

		footer.dispose();

		assert.equal(stopped, true);
	});

	it("shows the current canonical session name", () => {
		let sessionName = "neon-grunge-reboot";
		const footer = createAnimatedPlanFooter(
			{ requestRender: () => {} },
			{ fg: (_color: string, text: string) => text },
			() => () => {},
			() => sessionName,
		);

		assert.equal(footer.render(80)[0], "● planning · neon-grunge-reboot");

		sessionName = "Manually Renamed Session";
		assert.equal(footer.render(80)[0], "● planning · Manually Renamed Session");
	});

	it("renders extension-supplied names as safe single-line text", () => {
		const footer = createAnimatedPlanFooter(
			{ requestRender: () => {} },
			{ fg: (_color: string, text: string) => text },
			() => () => {},
			() => "  Neon\u001b[31m\nGrunge\tReboot  ",
		);

		assert.equal(footer.render(80)[0], "● planning · Neon Grunge Reboot");
	});

	it("truncates names on grapheme boundaries and terminal columns", () => {
		let sessionName = "🚀 Remix";
		const footer = createAnimatedPlanFooter(
			{ requestRender: () => {} },
			{ fg: (_color: string, text: string) => text },
			() => () => {},
			() => sessionName,
		);

		assert.equal(footer.render(14)[0], "● planning · ");
		assert.equal(footer.render(15)[0], "● planning · 🚀");

		sessionName = "東京 Remix";
		assert.equal(footer.render(15)[0], "● planning · 東");
	});
});

describe("updatePlanStatus", () => {
	it("replaces the standard footer with the planning indicator and current session name while active", () => {
		let footerFactory: ((...args: any[]) => { render(width: number): string[]; dispose(): void }) | undefined;
		const ui = {
			setFooter: (factory: typeof footerFactory) => {
				footerFactory = factory;
			},
		};

		updatePlanStatus(ui, true, () => "neon-grunge-reboot");

		assert.ok(footerFactory);
		const footer = footerFactory(undefined, {
			fg: (color: string, text: string) => `<${color}>${text}</${color}>`,
		});
		assert.deepEqual(footer.render(80), [
			"<accent>●</accent><muted> planning · neon-grunge-reboot</muted>",
		]);
		footer.dispose();
	});

	it("does not render past a zero-width terminal boundary", () => {
		let footerFactory: ((...args: any[]) => { render(width: number): string[]; dispose(): void }) | undefined;
		const ui = {
			setFooter: (factory: typeof footerFactory) => {
				footerFactory = factory;
			},
		};
		updatePlanStatus(ui, true);

		assert.ok(footerFactory);
		const footer = footerFactory(undefined, {
			fg: (color: string, text: string) => `<${color}>${text}</${color}>`,
		});
		assert.deepEqual(footer.render(0), [""]);
		footer.dispose();
	});

	it("restores the standard footer and clears the planning indicator when inactive", () => {
		const statuses: Array<[string, string | undefined]> = [];
		const footers: unknown[] = [];
		const ui = {
			setStatus: (key: string, text: string | undefined) => statuses.push([key, text]),
			setFooter: (factory: unknown) => footers.push(factory),
		};

		updatePlanStatus(ui, false);

		assert.deepEqual(footers, [undefined]);
		assert.deepEqual(statuses, [["plan-mode", undefined]]);
	});
});
