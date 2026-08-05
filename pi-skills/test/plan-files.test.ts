import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { generatePlanPath, preparePlanMutation } from "../extensions/plan-files.ts";

async function withTempDirectory(run: (directory: string) => Promise<void>): Promise<void> {
	const directory = await mkdtemp(join(tmpdir(), "pi-plan-files-"));
	try {
		await run(directory);
	} finally {
		await rm(directory, { recursive: true, force: true });
	}
}

describe("generatePlanPath", () => {
	it("prefixes the readable task name with its creation timestamp", async () => {
		await withTempDirectory(async (cwd) => {
			const path = await generatePlanPath(
				cwd,
				".pi",
				"Save the plan with a generated name",
				new Date("2026-06-29T23:15:07Z"),
			);

			assert.equal(path, ".pi/plans/2026-06-29-231507-save-the-plan-with-a-generated-name.md");
		});
	});

	it("keeps an unnamed plan readable", async () => {
		await withTempDirectory(async (cwd) => {
			const path = await generatePlanPath(cwd, ".pi", "", new Date("2026-06-29T23:15:07Z"));

			assert.equal(path, ".pi/plans/2026-06-29-231507-plan.md");
		});
	});

	it("advances the readable timestamp instead of adding a numeric suffix on collision", async () => {
		await withTempDirectory(async (cwd) => {
			const plansDirectory = join(cwd, ".pi", "plans");
			await mkdir(plansDirectory, { recursive: true });
			await writeFile(join(plansDirectory, "2026-06-29-231507-improve-auth.md"), "existing plan");

			const path = await generatePlanPath(cwd, ".pi", "Improve auth", new Date("2026-06-29T23:15:07Z"));

			assert.equal(path, ".pi/plans/2026-06-29-231508-improve-auth.md");
		});
	});
});

describe("preparePlanMutation", () => {
	it("redirects a legacy root PLAN.md write to the generated plan path", () => {
		const input = { path: "PLAN.md", content: "# Plan: Improve auth" };

		const isPlanMutation = preparePlanMutation("write", input, ".pi/plans/improve-auth.md");

		assert.equal(isPlanMutation, true);
		assert.equal(input.path, ".pi/plans/improve-auth.md");
	});

	it("redirects a legacy path with the built-in tools' optional @ prefix", () => {
		const input = { path: "@PLAN.md", content: "# Plan: Improve auth" };

		const isPlanMutation = preparePlanMutation("write", input, ".pi/plans/improve-auth.md");

		assert.equal(isPlanMutation, true);
		assert.equal(input.path, ".pi/plans/improve-auth.md");
	});
});
