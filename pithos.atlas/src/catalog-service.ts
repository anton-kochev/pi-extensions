import type { Catalog, CatalogPackage } from "./catalog.ts";
import type { RegistryClient } from "./registry.ts";
import { isRetiredPackage } from "./retired-packages.ts";

export interface CatalogRefreshOptions {
	signal?: AbortSignal;
	refresh?: boolean;
	includeVersionHistory?: boolean;
}

export interface RefreshedCatalog {
	packages: CatalogPackage[];
	publishedVersions: Record<string, CatalogPackage[]>;
	piLatestVersion?: string;
	warnings: string[];
}

function warning(error: unknown): string {
	const message = error instanceof Error ? error.message : String(error);
	return message.length > 300 ? `${message.slice(0, 297)}...` : message;
}

export async function refreshCatalog(
	bundled: Catalog,
	registry: RegistryClient,
	options: CatalogRefreshOptions = {},
): Promise<RefreshedCatalog> {
	const warnings: string[] = [];
	const activeBundledPackages = bundled.packages.filter(({ name }) => !isRetiredPackage(name));
	const packageNames = new Set(activeBundledPackages.map(({ name }) => name));
	try {
		for (const name of await registry.discover(options)) {
			if (!isRetiredPackage(name)) packageNames.add(name);
		}
	} catch (error) {
		warnings.push(warning(error));
	}

	const packageByName = new Map(activeBundledPackages.map((pkg) => [pkg.name, pkg]));
	const publishedVersions: Record<string, CatalogPackage[]> = {};
	const packageResults = await Promise.all([...packageNames].sort().map(async (name) => {
		try {
			const versions = options.includeVersionHistory
				? await registry.versions(name, options)
				: [await registry.latest(name, options)];
			return { name, versions } as const;
		} catch (error) {
			return { name, error } as const;
		}
	}));
	for (const result of packageResults) {
		if ("error" in result) {
			warnings.push(warning(result.error));
			continue;
		}
		publishedVersions[result.name] = result.versions;
		packageByName.set(result.name, result.versions[0]);
	}

	let piLatestVersion: string | undefined;
	try {
		piLatestVersion = await registry.latestPiVersion(options);
	} catch (error) {
		warnings.push(warning(error));
	}

	return {
		packages: [...packageByName.values()].sort((left, right) => left.name.localeCompare(right.name)),
		publishedVersions,
		...(piLatestVersion ? { piLatestVersion } : {}),
		warnings: [...new Set(warnings)],
	};
}
