import * as fs from "node:fs";
import * as path from "node:path";
import { parseFrontmatter } from "@earendil-works/pi-coding-agent";

export const GUILD_MEMBER_NAMES = [
	"dotnet-architect",
	"frontend-architect",
	"csharp-coder",
	"angular-coder",
	"typescript-coder",
] as const;

export type GuildMemberName = (typeof GUILD_MEMBER_NAMES)[number];
export type GuildMemberSource = "builtin" | "user" | "project";

const ARCHITECT_TOOLS = ["read", "grep", "find", "ls"] as const;
const CODER_TOOLS = ["read", "grep", "find", "ls", "edit", "write", "bash"] as const;

export const GUILD_MEMBER_POLICIES: Record<GuildMemberName, { tools: readonly string[]; role: "architect" | "coder" }> = {
	"dotnet-architect": { tools: ARCHITECT_TOOLS, role: "architect" },
	"frontend-architect": { tools: ARCHITECT_TOOLS, role: "architect" },
	"csharp-coder": { tools: CODER_TOOLS, role: "coder" },
	"angular-coder": { tools: CODER_TOOLS, role: "coder" },
	"typescript-coder": { tools: CODER_TOOLS, role: "coder" },
};

export interface GuildMember {
	name: GuildMemberName;
	description: string;
	tools: readonly string[];
	systemPrompt: string;
	source: GuildMemberSource;
	filePath: string;
}

export interface GuildDiscoveryOptions {
	builtInDir: string;
	userDir?: string;
	projectDir?: string | null;
	includeProject?: boolean;
}

export interface GuildDiscoveryResult {
	members: GuildMember[];
	warnings: string[];
}

function isGuildMemberName(value: string): value is GuildMemberName {
	return (GUILD_MEMBER_NAMES as readonly string[]).includes(value);
}

function normalizedToolSet(tools: readonly string[]): string[] {
	return [...new Set(tools.map((tool) => tool.trim()).filter(Boolean))].sort();
}

function hasExpectedToolBoundary(name: GuildMemberName, tools: readonly string[]): boolean {
	const expected = normalizedToolSet(GUILD_MEMBER_POLICIES[name].tools);
	const actual = normalizedToolSet(tools);
	return expected.length === actual.length && expected.every((tool, index) => tool === actual[index]);
}

function loadDirectory(directory: string | undefined | null, source: GuildMemberSource, warnings: string[]): Map<GuildMemberName, GuildMember> {
	const members = new Map<GuildMemberName, GuildMember>();
	if (!directory || !fs.existsSync(directory)) return members;

	let entries: fs.Dirent[];
	try {
		entries = fs.readdirSync(directory, { withFileTypes: true });
	} catch (error) {
		warnings.push(`Could not read ${source} Guild member directory ${directory}: ${error instanceof Error ? error.message : String(error)}`);
		return members;
	}

	for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
		if (!entry.name.endsWith(".md") || (!entry.isFile() && !entry.isSymbolicLink())) continue;
		const filePath = path.join(directory, entry.name);

		let content: string;
		try {
			content = fs.readFileSync(filePath, "utf8");
		} catch (error) {
			warnings.push(`Could not read ${source} Guild member ${filePath}: ${error instanceof Error ? error.message : String(error)}`);
			continue;
		}

		let frontmatter: Record<string, unknown>;
		let body: string;
		try {
			const parsed = parseFrontmatter<Record<string, unknown>>(content);
			frontmatter = parsed.frontmatter;
			body = parsed.body.trim();
		} catch (error) {
			warnings.push(`Could not parse ${source} Guild member ${filePath}: ${error instanceof Error ? error.message : String(error)}`);
			continue;
		}

		const rawName = typeof frontmatter.name === "string" ? frontmatter.name.trim() : "";
		if (!isGuildMemberName(rawName)) continue;

		const description = typeof frontmatter.description === "string" ? frontmatter.description.trim() : "";
		const tools = typeof frontmatter.tools === "string"
			? frontmatter.tools.split(",").map((tool) => tool.trim()).filter(Boolean)
			: [];

		if (!description || !body) {
			warnings.push(`Ignoring ${source} override for ${rawName}: description and prompt body are required.`);
			continue;
		}
		if (!hasExpectedToolBoundary(rawName, tools)) {
			warnings.push(`Ignoring ${source} override for ${rawName}: it changes the required tool boundary.`);
			continue;
		}
		if (members.has(rawName)) {
			warnings.push(`Ignoring duplicate ${source} definition for ${rawName}: ${filePath}`);
			continue;
		}

		members.set(rawName, {
			name: rawName,
			description,
			tools: [...GUILD_MEMBER_POLICIES[rawName].tools],
			systemPrompt: body,
			source,
			filePath,
		});
	}

	return members;
}

export function discoverGuildMembers(options: GuildDiscoveryOptions): GuildDiscoveryResult {
	const warnings: string[] = [];
	const selected = loadDirectory(options.builtInDir, "builtin", warnings);

	for (const [name, member] of loadDirectory(options.userDir, "user", warnings)) selected.set(name, member);
	if (options.includeProject) {
		for (const [name, member] of loadDirectory(options.projectDir, "project", warnings)) selected.set(name, member);
	}

	return {
		members: GUILD_MEMBER_NAMES.flatMap((name) => {
			const member = selected.get(name);
			return member ? [member] : [];
		}),
		warnings,
	};
}

function isDirectory(directory: string): boolean {
	try {
		return fs.statSync(directory).isDirectory();
	} catch {
		return false;
	}
}

export function findNearestProjectAgentsDir(cwd: string, configDirectoryName = ".pi"): string | null {
	let current = path.resolve(cwd);
	while (true) {
		const candidate = path.join(current, configDirectoryName, "agents");
		if (isDirectory(candidate)) return candidate;
		const parent = path.dirname(current);
		if (parent === current) return null;
		current = parent;
	}
}
