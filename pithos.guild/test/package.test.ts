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
  });
});
