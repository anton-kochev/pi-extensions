import { valid, validRange } from "semver";

export const PITHOS_SCOPE = "@pithos-kit/";
const PITHOS_PACKAGE_NAME_RE = /^@pithos-kit\/[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/u;
export const CAPABILITY_KINDS = ["commands", "tools", "prompts", "skills", "themes", "agents"] as const;

export type CapabilityKind = (typeof CAPABILITY_KINDS)[number];

export interface NamedCapability {
	name: string;
	summary: string;
	usage?: string;
	internal?: boolean;
}

export interface ConfigurationEntry {
	kind: "file" | "directory" | "environment";
	key: string;
	summary: string;
}

export interface PithosKitMetadata {
	displayName: string;
	summary: string;
	minimumPi: string;
	commands: NamedCapability[];
	tools: NamedCapability[];
	prompts: NamedCapability[];
	skills: NamedCapability[];
	themes: NamedCapability[];
	agents: NamedCapability[];
	configuration: ConfigurationEntry[];
}

export interface CatalogPackage {
	name: string;
	version: string;
	description: string;
	pi?: Record<string, unknown>;
	pithosKit: PithosKitMetadata;
}

export interface Catalog {
	schemaVersion: 1;
	packages: CatalogPackage[];
}

function record(value: unknown, label: string): Record<string, unknown> {
	if (!value || typeof value !== "object" || Array.isArray(value)) {
		throw new Error(`${label} must be an object`);
	}
	return value as Record<string, unknown>;
}

function text(value: unknown, label: string): string {
	if (typeof value !== "string" || value.trim() === "") throw new Error(`${label} must be a non-empty string`);
	if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/u.test(value)) {
		throw new Error(`${label} must not contain control characters`);
	}
	return value;
}

function capability(value: unknown, label: string): NamedCapability {
	const item = record(value, label);
	return {
		name: text(item.name, `${label}.name`),
		summary: text(item.summary, `${label}.summary`),
		...(item.usage === undefined ? {} : { usage: text(item.usage, `${label}.usage`) }),
		...(item.internal === undefined ? {} : { internal: item.internal === true }),
	};
}

function capabilities(value: unknown, label: string): NamedCapability[] {
	if (!Array.isArray(value)) throw new Error(`${label} must be an array`);
	const items = value.map((item, index) => capability(item, `${label}[${index}]`));
	const names = new Set<string>();
	for (const item of items) {
		if (names.has(item.name)) throw new Error(`${label} contains a duplicate capability: ${item.name}`);
		names.add(item.name);
	}
	return items;
}

function configuration(value: unknown): ConfigurationEntry[] {
	if (!Array.isArray(value)) throw new Error("pithosKit.configuration must be an array");
	return value.map((entry, index) => {
		const item = record(entry, `pithosKit.configuration[${index}]`);
		const kind = text(item.kind, `pithosKit.configuration[${index}].kind`);
		if (kind !== "file" && kind !== "directory" && kind !== "environment") {
			throw new Error(`pithosKit.configuration[${index}].kind is invalid`);
		}
		return {
			kind,
			key: text(item.key, `pithosKit.configuration[${index}].key`),
			summary: text(item.summary, `pithosKit.configuration[${index}].summary`),
		};
	});
}

export function buildCatalog(manifests: unknown[]): Catalog {
	const packages = manifests.map(validatePackageManifest).sort((left, right) => left.name.localeCompare(right.name));
	for (let index = 1; index < packages.length; index += 1) {
		if (packages[index - 1]?.name === packages[index]?.name) {
			throw new Error(`catalog contains a duplicate package: ${packages[index]?.name}`);
		}
	}
	return { schemaVersion: 1, packages };
}

export function validatePackageManifest(value: unknown): CatalogPackage {
	const manifest = record(value, "manifest");
	const name = text(manifest.name, "manifest.name");
	if (!PITHOS_PACKAGE_NAME_RE.test(name)) throw new Error(`manifest.name must use a valid ${PITHOS_SCOPE} short name`);
	const version = text(manifest.version, "manifest.version");
	if (!valid(version)) throw new Error("manifest.version must be an exact semantic version");

	const metadata = record(manifest.pithosKit, "pithosKit");
	const minimumPi = text(metadata.minimumPi, "pithosKit.minimumPi");
	if (!validRange(minimumPi)) throw new Error("pithosKit.minimumPi must be a semantic version range");

	const pithosKit = {
		displayName: text(metadata.displayName, "pithosKit.displayName"),
		summary: text(metadata.summary, "pithosKit.summary"),
		minimumPi,
		commands: capabilities(metadata.commands, "pithosKit.commands"),
		tools: capabilities(metadata.tools, "pithosKit.tools"),
		prompts: capabilities(metadata.prompts, "pithosKit.prompts"),
		skills: capabilities(metadata.skills, "pithosKit.skills"),
		themes: capabilities(metadata.themes, "pithosKit.themes"),
		agents: capabilities(metadata.agents, "pithosKit.agents"),
		configuration: configuration(metadata.configuration),
	};

	return {
		name,
		version,
		description: text(manifest.description, "manifest.description"),
		...(manifest.pi === undefined ? {} : { pi: record(manifest.pi, "manifest.pi") }),
		pithosKit,
	};
}
