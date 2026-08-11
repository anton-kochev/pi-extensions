import { createTwoFilesPatch } from "diff";
import { gt, satisfies } from "semver";
import type { CatalogPackage } from "./catalog.ts";
import { isValidToolchainVersion, parsePithosConfig, stagePithosConfig } from "./pithos-config.ts";

const MAX_DIFF_DISPLAY_CHARS = 12_000;
const PI_STEP_TITLE = "Configure 1/3 · Pi version";
const TOOLCHAIN_STEP_TITLE = "Configure 2/3 · Toolchains";
const PACKAGE_STEP_TITLE = "Configure 3/3 · pithos-kit packages";

export interface AtlasWizardUI {
	select(title: string, options: string[]): Promise<string | undefined>;
	input(title: string, placeholder?: string): Promise<string | undefined>;
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

interface WizardToolchain {
	name: string;
	displayName: string;
}

const AVAILABLE_TOOLCHAINS: WizardToolchain[] = [
	{ name: "dotnet", displayName: ".NET" },
	{ name: "go", displayName: "Go" },
	{ name: "rust", displayName: "Rust" },
];

function wizardToolchains(configured: Record<string, string>): WizardToolchain[] {
	const rows = new Map(AVAILABLE_TOOLCHAINS.map((toolchain) => [toolchain.name, toolchain]));
	for (const name of Object.keys(configured)) {
		if (!rows.has(name)) rows.set(name, { name, displayName: name });
	}
	return [...rows.values()].sort((left, right) => left.displayName.localeCompare(right.displayName));
}

function toolchainLabel(toolchain: WizardToolchain, currentVersion: string | undefined, desiredVersion: string | undefined): string {
	if (desiredVersion !== currentVersion) {
		return `◈ ${toolchain.displayName} · ${desiredVersion ?? "disabled"}`;
	}
	return desiredVersion
		? `◆ ${toolchain.displayName} · ${desiredVersion}`
		: `◇ ${toolchain.displayName}`;
}

interface WizardPackage {
	name: string;
	displayName: string;
	catalog?: CatalogPackage;
}

function wizardPackages(packages: CatalogPackage[], configured: Record<string, string>): WizardPackage[] {
	const rows = new Map<string, WizardPackage>();
	for (const pkg of packages) {
		rows.set(pkg.name, { name: pkg.name, displayName: pkg.pithosKit.displayName, catalog: pkg });
	}
	for (const name of Object.keys(configured)) {
		if (!rows.has(name)) rows.set(name, { name, displayName: name });
	}
	return [...rows.values()].sort((left, right) => left.displayName.localeCompare(right.displayName));
}

function packageLabel(
	pkg: WizardPackage,
	currentVersion: string | undefined,
	desiredVersion: string | undefined,
	published: Record<string, CatalogPackage[]>,
	selectedPiVersion: string,
): string {
	const changed = desiredVersion !== currentVersion;
	if (changed && !desiredVersion) return `◈ ${pkg.displayName} · disabled`;
	const icon = changed ? "◈" : desiredVersion ? "◆" : "◇";
	const publishedVersions = published[pkg.name] ?? [];
	const latest = publishedVersions[0];
	const latestVersion = latest?.version;
	const latestRequirement = latest && !satisfies(selectedPiVersion, latest.pithosKit.minimumPi)
		? ` · requires Pi ${latest.pithosKit.minimumPi}`
		: "";
	if (desiredVersion) {
		const configured = publishedVersions.find(({ version }) => version === desiredVersion)
			?? (pkg.catalog?.version === desiredVersion ? pkg.catalog : undefined);
		const configuredRequirement = configured && !satisfies(selectedPiVersion, configured.pithosKit.minimumPi)
			? ` · requires Pi ${configured.pithosKit.minimumPi}`
			: "";
		const update = latestVersion && gt(latestVersion, desiredVersion)
			? ` ↑ ${latestVersion}${latestRequirement}`
			: "";
		const unavailable = !pkg.catalog && !latestVersion ? " · latest unavailable" : "";
		return `${icon} ${pkg.displayName} · ${desiredVersion}${configuredRequirement}${update}${unavailable}`;
	}
	return latestVersion
		? `${icon} ${pkg.displayName} · ${latestVersion}${latestRequirement}`
		: `${icon} ${pkg.displayName} · ${pkg.catalog?.version ?? "unknown"} · bundled (latest unavailable)`;
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
	const selectedPiLabel = await ui.select(PI_STEP_TITLE, piLabels);
	if (!selectedPiLabel) return undefined;
	const selectedPiVersion = versionFromLabel(selectedPiLabel);
	const desiredToolchains = { ...current.toolchains };
	const toolchains = wizardToolchains(current.toolchains);

	while (true) {
		const labels = [
			"Continue",
			...toolchains.map((toolchain) => toolchainLabel(
				toolchain,
				current.toolchains[toolchain.name],
				desiredToolchains[toolchain.name],
			)),
		];
		const selected = await ui.select(TOOLCHAIN_STEP_TITLE, labels);
		if (!selected) return undefined;
		if (selected === "Continue") break;
		const toolchain = toolchains[labels.indexOf(selected) - 1];
		if (!toolchain) continue;
		if (desiredToolchains[toolchain.name]) {
			const action = await ui.select(`${toolchain.displayName} ${desiredToolchains[toolchain.name]}`, ["Keep enabled", "Change version", "Disable"]);
			if (!action || action === "Keep enabled") continue;
			if (action === "Disable") {
				delete desiredToolchains[toolchain.name];
				continue;
			}
		}
		const version = (await ui.input(`${toolchain.displayName} version`, "Exact version: N, N.N, or N.N.N"))?.trim();
		if (!version) continue;
		if (!isValidToolchainVersion(version)) {
			ui.notify(`${toolchain.displayName} requires an exact numeric version: N, N.N, or N.N.N.`, "warning");
			continue;
		}
		desiredToolchains[toolchain.name] = version;
	}

	const desiredPackages = { ...current.packages };
	const packages = wizardPackages(input.packages, current.packages);

	while (true) {
		const labels = [
			"Review and Submit",
			...packages.map((pkg) => packageLabel(
				pkg,
				current.packages[pkg.name],
				desiredPackages[pkg.name],
				input.publishedVersions,
				selectedPiVersion,
			)),
		];
		const selected = await ui.select(PACKAGE_STEP_TITLE, labels);
		if (!selected) return undefined;
		if (selected === "Review and Submit") break;
		const packageIndex = labels.indexOf(selected) - 1;
		const pkg = packages[packageIndex];
		if (!pkg) continue;
		if (desiredPackages[pkg.name]) {
			const actions = ["Keep enabled", ...(pkg.catalog ? ["Change version"] : []), "Disable"];
			const action = await ui.select(`${pkg.displayName} ${desiredPackages[pkg.name]}`, actions);
			if (!action || action === "Keep enabled") continue;
			if (action === "Disable") {
				delete desiredPackages[pkg.name];
				continue;
			}
		}
		if (!pkg.catalog) continue;
		const available = packageVersions(pkg.catalog, input.publishedVersions);
		const versionLabels = available.map((entry) =>
			`${entry.version}${satisfies(selectedPiVersion, entry.pithosKit.minimumPi) ? "" : ` (requires Pi ${entry.pithosKit.minimumPi})`}`,
		);
		const selectedVersion = await ui.select(`${pkg.displayName} version`, versionLabels);
		if (selectedVersion) desiredPackages[pkg.name] = versionFromLabel(selectedVersion);
	}

	const staged = stagePithosConfig(input.source, { toolchains: desiredToolchains, piVersion: selectedPiVersion, packages: desiredPackages });
	if (staged === input.source) {
		ui.notify("No .pithos changes were selected.", "info");
		return undefined;
	}
	const diff = createTwoFilesPatch(".pithos (current)", ".pithos (proposed)", input.source, staged, "", "", { context: 3 });
	const displayedDiff = diff.length <= MAX_DIFF_DISPLAY_CHARS ? diff : `${diff.slice(0, MAX_DIFF_DISPLAY_CHARS)}\n... diff truncated; no changes have been written`;
	const confirmation = await ui.select(`Review .pithos changes\n\n${displayedDiff}`, ["No", "Yes"]);
	return confirmation === "Yes" ? staged : undefined;
}
