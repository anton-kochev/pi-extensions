import { rcompare, satisfies } from "semver";
import type { CatalogPackage } from "./catalog.ts";

export interface RuntimePackageEvidence {
	name: string;
	version?: string;
}

export interface DiagnosticsInput {
	activePiVersion: string;
	configuredPiVersion?: string;
	bundled: CatalogPackage[];
	publishedVersions: Record<string, CatalogPackage[]>;
	configuredPackages: Record<string, string>;
	runtimePackages: RuntimePackageEvidence[];
}

export interface PackageDiagnostic {
	name: string;
	bundledVersion?: string;
	configuredVersion?: string;
	loadedVersion?: string;
	latestVersion?: string;
	recommendedVersion?: string;
	compatibleWithActivePi?: boolean;
	compatibleWithConfiguredPi?: boolean;
}

export interface DiagnosticsReport {
	activePiVersion: string;
	configuredPiVersion?: string;
	packages: PackageDiagnostic[];
}

function metadataForVersion(versions: CatalogPackage[], version: string | undefined): CatalogPackage | undefined {
	return version ? versions.find((entry) => entry.version === version) : undefined;
}

function isCompatible(pkg: CatalogPackage | undefined, piVersion: string | undefined): boolean | undefined {
	return pkg && piVersion ? satisfies(piVersion, pkg.pithosKit.minimumPi) : undefined;
}

export function buildDiagnostics(input: DiagnosticsInput): DiagnosticsReport {
	const bundledByName = new Map(input.bundled.map((pkg) => [pkg.name, pkg]));
	const runtimeByName = new Map(input.runtimePackages.map((pkg) => [pkg.name, pkg]));
	const names = new Set([
		...bundledByName.keys(),
		...Object.keys(input.publishedVersions),
		...Object.keys(input.configuredPackages),
		...runtimeByName.keys(),
	]);
	const targetPiVersion = input.configuredPiVersion ?? input.activePiVersion;
	const packages = [...names].sort().map((name): PackageDiagnostic => {
		const bundled = bundledByName.get(name);
		const published = [...(input.publishedVersions[name] ?? [])].sort((left, right) => rcompare(left.version, right.version));
		const allVersions = [...published];
		if (bundled && !allVersions.some(({ version }) => version === bundled.version)) allVersions.push(bundled);
		allVersions.sort((left, right) => rcompare(left.version, right.version));
		const configuredVersion = input.configuredPackages[name];
		const runtime = runtimeByName.get(name);
		const loadedVersion = runtime?.version;
		const loadedMetadata = metadataForVersion(allVersions, loadedVersion) ?? (runtime && !loadedVersion ? bundled : undefined);
		const configuredMetadata = metadataForVersion(allVersions, configuredVersion);
		const recommended = allVersions.find((pkg) => satisfies(targetPiVersion, pkg.pithosKit.minimumPi));
		return {
			name,
			...(bundled ? { bundledVersion: bundled.version } : {}),
			...(configuredVersion ? { configuredVersion } : {}),
			...(loadedVersion ? { loadedVersion } : {}),
			...(published[0] ? { latestVersion: published[0].version } : {}),
			...(recommended ? { recommendedVersion: recommended.version } : {}),
			...(loadedMetadata ? { compatibleWithActivePi: isCompatible(loadedMetadata, input.activePiVersion) } : {}),
			...(configuredMetadata && input.configuredPiVersion
				? { compatibleWithConfiguredPi: isCompatible(configuredMetadata, input.configuredPiVersion) }
				: {}),
		};
	});
	return {
		activePiVersion: input.activePiVersion,
		...(input.configuredPiVersion ? { configuredPiVersion: input.configuredPiVersion } : {}),
		packages,
	};
}
