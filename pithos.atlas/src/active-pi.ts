import { readFileSync, realpathSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { valid } from "semver";

const PI_PACKAGE = "@earendil-works/pi-coding-agent";

export interface ActivePiVersionOptions {
	entrypoint?: string;
	fallbackVersion: string;
}

export function resolveActivePiVersion(options: ActivePiVersionOptions): string {
	if (!options.entrypoint) return options.fallbackVersion;

	let entrypoint: string;
	try {
		entrypoint = realpathSync(resolve(options.entrypoint));
	} catch {
		return options.fallbackVersion;
	}

	let directory = dirname(entrypoint);
	while (true) {
		try {
			const manifest = JSON.parse(readFileSync(join(directory, "package.json"), "utf8")) as {
				name?: unknown;
				version?: unknown;
			};
			if (manifest.name === PI_PACKAGE && typeof manifest.version === "string" && valid(manifest.version)) {
				return manifest.version;
			}
		} catch {
			// Continue towards the filesystem root until the running Pi package is found.
		}

		const parent = dirname(directory);
		if (parent === directory) return options.fallbackVersion;
		directory = parent;
	}
}
