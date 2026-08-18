import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { derivePlanSessionName } from "../extensions/plan-session-name.ts";

describe("derivePlanSessionName", () => {
	it("uses the approved outcome-focused Plan title", () => {
		const name = derivePlanSessionName(
			"# Plan: Fix OAuth callback retries\n\n## Goal\nKeep callbacks reliable.",
			".pi/plans/2026-08-18-180000-original-task.md",
		);

		assert.equal(name, "fix-oauth-callback-retries");
	});

	it("normalizes title accents, camel case, and punctuation to bounded kebab-case", () => {
		const name = derivePlanSessionName(
			`# Plan: CaféHTTP — Résumé ${"outcome ".repeat(30)}`,
			".pi/plans/2026-08-18-180000-fallback.md",
		);

		assert.match(name, /^[a-z0-9]+(?:-[a-z0-9]+)*$/u);
		assert.match(name, /^cafe-http-resume-outcome/u);
		assert.ok(name.length <= 120);
		assert.doesNotMatch(name, /-$/u);
	});

	it("falls back to the task-derived filename for missing or generic titles", () => {
		const path = ".pi/plans/2026-08-18-180000-rename-plan-sessions.md";

		assert.equal(derivePlanSessionName("## Goal\nRename it.", path), "rename-plan-sessions");
		assert.equal(derivePlanSessionName("# Plan: Implementation plan", path), "rename-plan-sessions");
		assert.equal(derivePlanSessionName("# Changes", path), "rename-plan-sessions");
	});

	it("uses a safe final fallback when neither source is meaningful", () => {
		assert.equal(derivePlanSessionName("# Plan", ".pi/plans/not-generated.md"), "plan");
	});
});
