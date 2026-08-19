import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it } from "node:test";

describe("Guild package metadata", () => {
  it("publishes under the Guild package identity", () => {
    const packageJson = JSON.parse(readFileSync(resolve(import.meta.dirname, "../package.json"), "utf8"));

    assert.equal(packageJson.name, "@pithos-kit/guild");
    assert.equal(packageJson.repository.directory, "pithos.guild");
    assert.match(packageJson.description, /Guild members/);
    assert.match(packageJson.description, /TypeScript/i);
    assert.match(packageJson.description, /Rust/i);
    assert.match(packageJson.description, /review/i);
    assert.ok(packageJson.pithosKit.agents.some(({ name }: { name: string }) => name === "typescript-coder"));
    assert.ok(packageJson.pithosKit.agents.some(({ name }: { name: string }) => name === "rust-coder"));
    assert.ok(packageJson.pithosKit.agents.some(({ name }: { name: string }) => name === "code-reviewer"));
  });
});
