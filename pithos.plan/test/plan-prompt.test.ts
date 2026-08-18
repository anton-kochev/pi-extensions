import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it } from "node:test";

const planPrompt = readFileSync(resolve(import.meta.dirname, "../prompts/plan.md"), "utf8");

describe("Plan prompt approval workflow", () => {
	it("requires an outcome-focused title suitable for contextual session naming", () => {
		assert.match(planPrompt, /title must concisely name the feature, bug, or outcome/i);
		assert.match(planPrompt, /avoid generic\s+titles/i);
	});

	it("uses the interactive create_plan confirmation as the sole final approval gate", () => {
		assert.match(planPrompt, /interactive confirmation is the sole final\s+approval gate/i);
		assert.match(planPrompt, /call\s+`create_plan` immediately/i);
	});

	it("does not request a separate conversational go-ahead", () => {
		assert.doesNotMatch(planPrompt, /explicitly say go ahead/i);
		assert.doesNotMatch(planPrompt, /without an explicit go-ahead/i);
		assert.doesNotMatch(planPrompt, /user has \*explicitly\* confirmed/i);
	});
});
