import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { updatePlanStatus } from "../extensions/plan-status.ts";

describe("updatePlanStatus", () => {
	it("replaces the standard footer with only a minimal planning indicator while active", () => {
		let footerFactory: ((...args: any[]) => { render(width: number): string[] }) | undefined;
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
		assert.deepEqual(footer.render(80), ["<accent>●</accent><muted> planning</muted>"]);
	});

	it("does not render past a zero-width terminal boundary", () => {
		let footerFactory: ((...args: any[]) => { render(width: number): string[] }) | undefined;
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
