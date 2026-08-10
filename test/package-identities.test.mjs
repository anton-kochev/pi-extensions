import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it } from "node:test";

const root = resolve(import.meta.dirname, "..");
const repositoryUrl = "git+https://github.com/anton-kochev/pithos-kit.git";
const packages = [
  "pithos.squiggle",
  "pithos.echo",
  "pithos.answer",
  "pithos.telos",
  "pithos.aegis",
  "pithos.guild",
  "pithos.context-bar",
  "pithos.skills",
];

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

describe("pithos-kit package identities", () => {
  it("uses the confirmed dotted identity map consistently", () => {
    const rootPackage = readJson(resolve(root, "package.json"));
    assert.equal(rootPackage.name, "pithos-kit");
    assert.equal(rootPackage.repository.url, repositoryUrl);

    const readme = readFileSync(resolve(root, "README.md"), "utf8");
    assert.match(readme, /^# pithos-kit$/m);

    for (const directory of packages) {
      assert.equal(existsSync(resolve(root, directory)), true, `missing ${directory}/`);

      const manifest = readJson(resolve(root, directory, "package.json"));
      assert.equal(manifest.name, `@anton-kochev/${directory}`);
      assert.match(manifest.version, /^\d+\.\d+\.\d+$/);
      assert.equal(manifest.keywords.includes("pithos"), true);
      assert.equal(manifest.repository.url, repositoryUrl);
      assert.equal(manifest.repository.directory, directory);

      const workflowPath = resolve(root, ".github", "workflows", `publish-${directory}.yml`);
      assert.equal(existsSync(workflowPath), true, `missing publish-${directory}.yml`);
      const workflow = readFileSync(workflowPath, "utf8");
      assert.match(workflow, new RegExp(`tags: \\["${directory.replaceAll(".", "\\.")}-v\\*"\\]`));
      assert.match(workflow, new RegExp(`working-directory: ${directory.replaceAll(".", "\\.")}`));
      assert.match(workflow, /npm pack --dry-run/);
      assert.match(workflow, /npm publish --provenance --access public/);
      assert.match(readme, new RegExp(`@anton-kochev/${directory.replaceAll(".", "\\.")}`));
    }
  });
});
