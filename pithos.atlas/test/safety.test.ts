import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { planModeState } from "../src/safety.ts";

describe("Atlas configuration safety", () => {
	it("uses the latest valid Plan-mode branch entry and fails closed on malformed state", () => {
		assert.equal(planModeState([]), "inactive");
		assert.equal(planModeState([
			{ type: "custom", customType: "plan-theme-state", data: { active: true } },
		]), "active");
		assert.equal(planModeState([
			{ type: "custom", customType: "plan-theme-state", data: { active: true } },
			{ type: "custom", customType: "plan-theme-state", data: { active: false } },
		]), "inactive");
		assert.equal(planModeState([
			{ type: "custom", customType: "plan-theme-state", data: { active: "yes" } },
		]), "indeterminate");
	});
});
