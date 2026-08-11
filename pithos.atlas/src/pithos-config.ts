import { valid } from "semver";
import { isAlias, isMap, isSeq, parseAllDocuments, type Document } from "yaml";

const PITHOS_PACKAGE_RE = /^@pithos-kit\/[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/u;
const NPM_PIN_RE = /^npm:(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)$/u;
const TOOLCHAIN_NAME_RE = /^[a-z0-9]+$/u;
const TOOLCHAIN_VERSION_RE = /^\d+(?:\.\d+){0,2}$/u;

export function isValidToolchainVersion(value: string): boolean {
	return TOOLCHAIN_VERSION_RE.test(value);
}

export interface ManagedPithosState {
	toolchains: Record<string, string>;
	piVersion?: string;
	packages: Record<string, string>;
}

export interface ParsedPithosConfig {
	document: Document;
	state: ManagedPithosState;
}

export interface ManagedPithosUpdate {
	toolchains?: Record<string, string>;
	piVersion?: string;
	packages?: Record<string, string>;
}

export class PithosConfigError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "PithosConfigError";
	}
}

function containsAlias(node: unknown): boolean {
	if (isAlias(node)) return true;
	if (isMap(node)) return node.items.some((pair) => containsAlias(pair.key) || containsAlias(pair.value));
	if (isSeq(node)) return node.items.some(containsAlias);
	return false;
}

function sameEntries(left: Record<string, string>, right: Record<string, string>): boolean {
	const leftEntries = Object.entries(left).sort(([a], [b]) => a.localeCompare(b));
	const rightEntries = Object.entries(right).sort(([a], [b]) => a.localeCompare(b));
	return JSON.stringify(leftEntries) === JSON.stringify(rightEntries);
}

function validateManagedToolchains(toolchains: Record<string, string>): void {
	for (const [name, version] of Object.entries(toolchains)) {
		if (!TOOLCHAIN_NAME_RE.test(name)) throw new PithosConfigError(`Invalid toolchain name: ${name}`);
		if (!isValidToolchainVersion(version)) throw new PithosConfigError(`${name} must use an exact numeric toolchain version`);
	}
}

function validateManagedPackages(packages: Record<string, string>): void {
	for (const [name, version] of Object.entries(packages)) {
		if (!PITHOS_PACKAGE_RE.test(name)) throw new PithosConfigError(`Invalid pithos-kit package name: ${name}`);
		if (!valid(version)) throw new PithosConfigError(`${name} must use an exact semantic version`);
	}
}

export function stagePithosConfig(source: string, update: ManagedPithosUpdate): string {
	const parsed = parsePithosConfig(source);
	const toolchains = update.toolchains ?? parsed.state.toolchains;
	validateManagedToolchains(toolchains);
	const piVersion = update.piVersion ?? parsed.state.piVersion;
	if (piVersion !== undefined && !valid(piVersion)) {
		throw new PithosConfigError("pi.version must be an exact semantic version");
	}
	const packages = update.packages ?? parsed.state.packages;
	validateManagedPackages(packages);
	if (
		sameEntries(toolchains, parsed.state.toolchains)
		&& piVersion === parsed.state.piVersion
		&& sameEntries(packages, parsed.state.packages)
	) return source;

	const document = parsed.document;
	if (document.contents === null) document.contents = document.createNode({});
	if (document.get("toolchains", true) === undefined) document.set("toolchains", document.createNode({}));
	const toolchainsNode = document.get("toolchains", true);
	if (isMap(toolchainsNode)) {
		for (const pair of [...toolchainsNode.items]) {
			const name = pair.key?.toString();
			if (name && !(name in toolchains)) toolchainsNode.delete(name);
		}
		for (const [name, version] of Object.entries(toolchains).sort(([a], [b]) => a.localeCompare(b))) {
			toolchainsNode.set(name, version);
		}
	}
	if (document.get("pi", true) === undefined) document.set("pi", document.createNode({}));
	if (piVersion !== undefined) document.setIn(["pi", "version"], piVersion);

	let extensions = document.getIn(["pi", "extensions"], true);
	if (Object.keys(packages).length > 0 && extensions === undefined) {
		document.setIn(["pi", "extensions"], document.createNode({}));
		extensions = document.getIn(["pi", "extensions"], true);
	}
	if (isMap(extensions)) {
		for (const pair of [...extensions.items]) {
			const name = pair.key?.toString();
			if (name && PITHOS_PACKAGE_RE.test(name)) extensions.delete(name);
		}
		for (const [name, version] of Object.entries(packages).sort(([a], [b]) => a.localeCompare(b))) {
			extensions.set(name, `npm:${version}`);
		}
	}
	return document.toString({ lineWidth: 0 });
}

export function parsePithosConfig(source: string): ParsedPithosConfig {
	const documents = parseAllDocuments(source.trim() === "" ? "{}\n" : source, { uniqueKeys: true, merge: false });
	if (documents.length !== 1) throw new PithosConfigError(".pithos must contain exactly one YAML document");
	const document = documents[0];
	if (document.errors.length > 0) throw new PithosConfigError(`Invalid .pithos YAML: ${document.errors[0]?.message}`);
	if (containsAlias(document.contents)) throw new PithosConfigError(".pithos aliases are not supported");
	if (!isMap(document.contents)) throw new PithosConfigError(".pithos must be a mapping");

	const toolchainsNode = document.get("toolchains", true);
	if (toolchainsNode !== undefined && toolchainsNode !== null && !isMap(toolchainsNode)) {
		throw new PithosConfigError(".pithos toolchains must be a mapping");
	}
	const toolchains: Record<string, string> = {};
	if (isMap(toolchainsNode)) {
		for (const pair of toolchainsNode.items) {
			const name = pair.key?.toString();
			if (!name || !TOOLCHAIN_NAME_RE.test(name)) {
				throw new PithosConfigError(".pithos toolchain names must contain only lowercase letters and digits");
			}
			const version = document.getIn(["toolchains", name]);
			if (typeof version !== "string" || !isValidToolchainVersion(version)) {
				throw new PithosConfigError(`${name} must use an exact numeric toolchain version`);
			}
			toolchains[name] = version;
		}
	}

	const piNode = document.get("pi", true);
	if (piNode !== undefined && piNode !== null && !isMap(piNode)) {
		throw new PithosConfigError(".pithos pi must be a mapping");
	}
	const piVersionValue = document.getIn(["pi", "version"]);
	let piVersion: string | undefined;
	if (piVersionValue !== undefined) {
		if (typeof piVersionValue !== "string" || !valid(piVersionValue)) {
			throw new PithosConfigError(".pithos pi.version must be an exact semantic version");
		}
		piVersion = piVersionValue;
	}

	const extensionsNode = document.getIn(["pi", "extensions"], true);
	if (extensionsNode !== undefined && extensionsNode !== null && !isMap(extensionsNode)) {
		throw new PithosConfigError(".pithos pi.extensions must be a mapping");
	}
	const packages: Record<string, string> = {};
	if (isMap(extensionsNode)) {
		for (const pair of extensionsNode.items) {
			const name = pair.key?.toString();
			if (!name || !PITHOS_PACKAGE_RE.test(name)) continue;
			const value = pair.value?.toString();
			const match = value?.match(NPM_PIN_RE);
			if (!match || !valid(match[1])) {
				throw new PithosConfigError(`${name} must use an exact npm:<version> pin`);
			}
			packages[name] = match[1];
		}
	}

	return { document, state: { toolchains, piVersion, packages } };
}
