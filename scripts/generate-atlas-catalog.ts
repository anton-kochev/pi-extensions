import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildCatalog } from "../pithos.atlas/src/catalog.ts";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const entries = await readdir(root, { withFileTypes: true });
const directories = entries
	.filter((entry) => entry.isDirectory() && entry.name.startsWith("pithos."))
	.map((entry) => entry.name)
	.sort();
const manifests = await Promise.all(
	directories.map(async (directory) => JSON.parse(await readFile(resolve(root, directory, "package.json"), "utf8"))),
);
const catalog = buildCatalog(manifests);
const destination = resolve(root, "pithos.atlas", "src", "generated", "catalog.json");
await mkdir(dirname(destination), { recursive: true });
await writeFile(destination, `${JSON.stringify(catalog, null, 2)}\n`, "utf8");
console.log(`Generated ${destination} from ${catalog.packages.length} package manifests.`);
