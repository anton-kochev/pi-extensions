import { createTwoFilesPatch } from "diff";
import { satisfies } from "semver";
import type { CatalogPackage } from "./catalog.ts";
import { parsePithosConfig, stagePithosConfig } from "./pithos-config.ts";

const MAX_DIFF_DISPLAY_CHARS = 12_000;

export interface AtlasWizardUI {
	select(title: string, options: string[]): Promise<string | undefined>;
	notify(message: string, type?: "info" | "warning" | "error"): void;
}

export interface ConfigWizardInput {
	source: string;
	activePiVersion: string;
	latestPiVersion?: string;
	packages: CatalogPackage[];
	publishedVersions: Record<string, CatalogPackage[]>;
}

function versionFromLabel(label: string): string {
	return label.split(" ", 1)[0];
}

function packageVersions(pkg: CatalogPackage, published: Record<string, CatalogPackage[]>): CatalogPackage[] {
	const versions = [...(published[pkg.name] ?? [])];
	if (!versions.some(({ version }) => version === pkg.version)) versions.push(pkg);
	return versions;
}

export async function runConfigWizard(ui: AtlasWizardUI, input: ConfigWizardInput): Promise<string | undefined> {
	const current = parsePithosConfig(input.source).state;
	const piVersions = [...new Set([current.piVersion, input.latestPiVersion, input.activePiVersion].filter((value): value is string => !!value))];
	const piLabels = piVersions.map((version) => {
		const notes = [
			version === current.piVersion ? "configured" : undefined,
			version === input.latestPiVersion ? "latest" : undefined,
			version === input.activePiVersion ? "active" : undefined,
		].filter(Boolean);
		return notes.length > 0 ? `${version} (${notes.join(", ")})` : version;
	});
	const selectedPiLabel = await ui.select("Pi version", piLabels);
	if (!selectedPiLabel) return undefined;
	const selectedPiVersion = versionFromLabel(selectedPiLabel);
	const desiredPackages = { ...current.packages };
	const packages = [...input.packages].sort((left, right) => left.pithosKit.displayName.localeCompare(right.pithosKit.displayName));

	while (true) {
		const labels = [
			"Review changes",
			...packages.map((pkg) => {
				const version = desiredPackages[pkg.name];
				return `${version ? "✓" : "○"} ${pkg.pithosKit.displayName}${version ? ` ${version}` : ""}`;
			}),
			"Cancel",
		];
		const selected = await ui.select("Pithos packages", labels);
		if (!selected || selected === "Cancel") return undefined;
		if (selected === "Review changes") break;
		const packageIndex = labels.indexOf(selected) - 1;
		const pkg = packages[packageIndex];
		if (!pkg) continue;
		if (desiredPackages[pkg.name]) {
			const action = await ui.select(`${pkg.pithosKit.displayName} ${desiredPackages[pkg.name]}`, ["Keep enabled", "Change version", "Disable"]);
			if (!action || action === "Keep enabled") continue;
			if (action === "Disable") {
				delete desiredPackages[pkg.name];
				continue;
			}
		}
		const available = packageVersions(pkg, input.publishedVersions);
		const versionLabels = available.map((entry) =>
			`${entry.version}${satisfies(selectedPiVersion, entry.pithosKit.minimumPi) ? "" : ` (requires Pi ${entry.pithosKit.minimumPi})`}`,
		);
		const selectedVersion = await ui.select(`${pkg.pithosKit.displayName} version`, versionLabels);
		if (selectedVersion) desiredPackages[pkg.name] = versionFromLabel(selectedVersion);
	}

	const staged = stagePithosConfig(input.source, { piVersion: selectedPiVersion, packages: desiredPackages });
	if (staged === input.source) {
		ui.notify("No .pithos changes were selected.", "info");
		return undefined;
	}
	const diff = createTwoFilesPatch(".pithos (current)", ".pithos (proposed)", input.source, staged, "", "", { context: 3 });
	const displayedDiff = diff.length <= MAX_DIFF_DISPLAY_CHARS ? diff : `${diff.slice(0, MAX_DIFF_DISPLAY_CHARS)}\n... diff truncated; no changes have been written`;
	const confirmation = await ui.select(`Review .pithos changes\n\n${displayedDiff}`, ["No", "Yes"]);
	return confirmation === "Yes" ? staged : undefined;
}
