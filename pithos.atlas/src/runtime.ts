import { readFile } from "node:fs/promises";
import { basename, resolve } from "node:path";
import { valid } from "semver";
import type { CatalogPackage } from "./catalog.ts";

export interface RuntimeSourceInfo {
	path: string;
	source: string;
	baseDir?: string;
}

export interface RuntimeCommandInfo {
	name: string;
	source: string;
	sourceInfo: RuntimeSourceInfo;
}

export interface RuntimeToolInfo {
	name: string;
	sourceInfo: RuntimeSourceInfo;
}

export interface ObservedRuntimePackage {
	name: string;
	version?: string;
	commands: string[];
	tools: string[];
}

function packageForSource(packages: CatalogPackage[], sourceInfo: RuntimeSourceInfo): CatalogPackage | undefined {
	const evidence = `${sourceInfo.source}\n${sourceInfo.path}\n${sourceInfo.baseDir ?? ""}`;
	return packages.find((pkg) => {
		if (evidence.includes(pkg.name)) return true;
		const shortName = pkg.name.slice("@pithos-kit/".length);
		return sourceInfo.baseDir ? basename(resolve(sourceInfo.baseDir)) === `pithos.${shortName}` : false;
	});
}

async function versionFromSource(sourceInfo: RuntimeSourceInfo, expectedName: string): Promise<string | undefined> {
	if (!sourceInfo.baseDir) return undefined;
	try {
		const raw = JSON.parse(await readFile(resolve(sourceInfo.baseDir, "package.json"), "utf8")) as {
			name?: unknown;
			version?: unknown;
		};
		return raw.name === expectedName && typeof raw.version === "string" && valid(raw.version) ? raw.version : undefined;
	} catch {
		return undefined;
	}
}

export async function observeRuntime(
	packages: CatalogPackage[],
	commands: RuntimeCommandInfo[],
	tools: RuntimeToolInfo[],
): Promise<ObservedRuntimePackage[]> {
	const observations = new Map<string, { pkg: CatalogPackage; sources: RuntimeSourceInfo[]; commands: Set<string>; tools: Set<string> }>();
	const entry = (pkg: CatalogPackage, sourceInfo: RuntimeSourceInfo) => {
		let observation = observations.get(pkg.name);
		if (!observation) {
			observation = { pkg, sources: [], commands: new Set(), tools: new Set() };
			observations.set(pkg.name, observation);
		}
		observation.sources.push(sourceInfo);
		return observation;
	};
	for (const command of commands) {
		const pkg = packageForSource(packages, command.sourceInfo);
		if (pkg) entry(pkg, command.sourceInfo).commands.add(command.name);
	}
	for (const tool of tools) {
		const pkg = packageForSource(packages, tool.sourceInfo);
		if (pkg) entry(pkg, tool.sourceInfo).tools.add(tool.name);
	}

	const result: ObservedRuntimePackage[] = [];
	for (const [name, observation] of observations) {
		let version: string | undefined;
		for (const source of observation.sources) {
			version = await versionFromSource(source, name);
			if (version) break;
		}
		result.push({
			name,
			...(version ? { version } : {}),
			commands: [...observation.commands].sort(),
			tools: [...observation.tools].sort(),
		});
	}
	return result.sort((left, right) => left.name.localeCompare(right.name));
}
