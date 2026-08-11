import { readFileSync } from "node:fs";
import type { Catalog } from "./catalog.ts";

const bundledUrl = new URL("./generated/catalog.json", import.meta.url);

export function loadBundledCatalog(): Catalog {
	const parsed = JSON.parse(readFileSync(bundledUrl, "utf8")) as Catalog;
	if (parsed.schemaVersion !== 1 || !Array.isArray(parsed.packages)) {
		throw new Error("Bundled Atlas catalog is invalid");
	}
	return parsed;
}
