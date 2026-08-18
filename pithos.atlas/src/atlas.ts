import { join } from "node:path";
import { VERSION, type ExtensionAPI, type ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { resolveActivePiVersion } from "./active-pi.ts";
import { loadBundledCatalog } from "./bundled-catalog.ts";
import registerCommitWorkflow from "./commit.ts";
import type { Catalog, CatalogPackage } from "./catalog.ts";
import { refreshCatalog, type RefreshedCatalog } from "./catalog-service.ts";
import { commitConfig, readConfigSnapshot, type ConfigSnapshot } from "./config-transaction.ts";
import { buildDiagnostics, type DiagnosticsReport } from "./diagnostics.ts";
import { parsePithosConfig, type ManagedPithosState } from "./pithos-config.ts";
import { isOfflineEnvironment, RegistryClient } from "./registry.ts";
import { observeRuntime, type ObservedRuntimePackage } from "./runtime.ts";
import { registerSessionNaming } from "./session-name.ts";
import { planModeState } from "./safety.ts";
import { runConfigWizard } from "./ui.ts";

const MAX_OUTPUT_CHARS = 40_000;

export const ATLAS_HELP = `Pithos Atlas gives eligible new sessions readable 3–5-word session names after their first user message, creates confirmed Conventional Commits, configures reproducible toolchain, Pi, and package pins, and diagnoses the active environment.

Usage: /pithos [command]

Atlas workflow:
  /commit [instructions]   Prepare a context-scoped commit with mandatory interactive confirmation

Pithos commands:
  /pithos                  Open the interactive Atlas menu
  /pithos help             Show this help
  /pithos packages         List pithos-kit packages and capabilities
  /pithos versions         Check published versions (use --refresh to bypass the session cache)
  /pithos doctor           Diagnose Pi, package, runtime, and .pithos compatibility
  /pithos config           Manage toolchain, Pi, and pithos-kit pins interactively
  /pithos config validate  Validate .pithos without changing it`;

export type AtlasCommand =
	| { action: "menu" }
	| { action: "help" }
	| { action: "packages" }
	| { action: "versions"; refresh: boolean }
	| { action: "doctor"; refresh: boolean }
	| { action: "config" }
	| { action: "config-validate" };

export function parseAtlasCommand(args: string): AtlasCommand {
	const tokens = args.trim().split(/\s+/u).filter(Boolean);
	if (tokens.length === 0) return { action: "menu" };
	if (tokens.length === 1 && tokens[0] === "help") return { action: "help" };
	if (tokens.length === 1 && tokens[0] === "packages") return { action: "packages" };
	if ((tokens[0] === "versions" || tokens[0] === "doctor") && tokens.slice(1).every((token) => token === "--refresh")) {
		return { action: tokens[0], refresh: tokens.includes("--refresh") };
	}
	if (tokens.length === 1 && tokens[0] === "config") return { action: "config" };
	if (tokens.length === 2 && tokens[0] === "config" && tokens[1] === "validate") return { action: "config-validate" };
	throw new Error(ATLAS_HELP);
}

const KEBAB_CASE_SESSION_NAME_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;

function toKebabCaseSessionName(value: string): string {
	return value
		.normalize("NFKD")
		.replace(/([a-z0-9])([A-Z])/gu, "$1-$2")
		.replace(/[\u0300-\u036f]/gu, "")
		.toLowerCase()
		.replace(/[^a-z0-9]+/gu, "-")
		.replace(/^-+|-+$/gu, "")
		|| "unnamed-session";
}

const RENAME_SESSION_PARAMETERS = Type.Object({
	name: Type.String({
		minLength: 1,
		maxLength: 120,
		pattern: KEBAB_CASE_SESSION_NAME_RE.source,
		description: "New lowercase kebab-case display name for the current Pi session",
	}),
});

const INFO_PARAMETERS = Type.Object({
	action: Type.Union([
		Type.Literal("catalog"),
		Type.Literal("versions"),
		Type.Literal("runtime"),
		Type.Literal("config"),
		Type.Literal("doctor"),
	], { description: "Read-only information to retrieve" }),
	package: Type.Optional(Type.String({ description: "Optional @pithos-kit package name" })),
	refresh: Type.Optional(Type.Boolean({ description: "Bypass successful session registry caches" })),
});

type RenameSessionRequest = { name: string };
type InfoRequest = { action: "catalog" | "versions" | "runtime" | "config" | "doctor"; package?: string; refresh?: boolean };

interface ConfigObservation {
	snapshot: ConfigSnapshot;
	state: ManagedPithosState;
}

function bounded(text: string): string {
	return text.length <= MAX_OUTPUT_CHARS ? text : `${text.slice(0, MAX_OUTPUT_CHARS)}\n... output truncated`;
}

function emitText(ctx: Pick<ExtensionCommandContext, "hasUI" | "ui">, text: string, level: "info" | "warning" | "error" = "info"): void {
	const output = bounded(text);
	if (ctx.hasUI) ctx.ui.notify(output, level);
	else console.log(output);
}

async function readConfig(cwd: string): Promise<ConfigObservation> {
	const snapshot = await readConfigSnapshot(join(cwd, ".pithos"));
	return { snapshot, state: parsePithosConfig(snapshot.content).state };
}

function selectPackage<T extends { name: string }>(items: T[], packageName?: string): T[] {
	return packageName ? items.filter(({ name }) => name === packageName) : items;
}

function formatCatalog(packages: CatalogPackage[], runtime: ObservedRuntimePackage[]): string {
	const loaded = new Map(runtime.map((item) => [item.name, item]));
	return bounded([
		"pithos-kit packages",
		...packages.map((pkg) => {
			const observation = loaded.get(pkg.name);
			const status = observation ? `loaded${observation.version ? ` ${observation.version}` : ""}` : "not detected";
			const named = (items: Array<{ name: string; internal?: boolean }>) =>
				items.map(({ name, internal }) => `${name}${internal ? " (internal)" : ""}`).join(", ");
			const groups = [
				pkg.pithosKit.commands.length > 0 ? `commands: ${pkg.pithosKit.commands.map(({ name }) => `/${name}`).join(", ")}` : undefined,
				pkg.pithosKit.tools.length > 0 ? `tools: ${named(pkg.pithosKit.tools)}` : undefined,
				pkg.pithosKit.prompts.length > 0 ? `prompts: ${named(pkg.pithosKit.prompts)}` : undefined,
				pkg.pithosKit.skills.length > 0 ? `skills: ${named(pkg.pithosKit.skills)}` : undefined,
				pkg.pithosKit.themes.length > 0 ? `themes: ${named(pkg.pithosKit.themes)}` : undefined,
				pkg.pithosKit.agents.length > 0 ? `agents: ${named(pkg.pithosKit.agents)}` : undefined,
				pkg.pithosKit.configuration.length > 0
					? `configuration: ${pkg.pithosKit.configuration.map(({ kind, key }) => `${kind} ${key}`).join(", ")}`
					: undefined,
			].filter((line): line is string => !!line);
			return `${pkg.name}@${pkg.version} [${status}]\n  ${pkg.pithosKit.summary}${groups.length > 0 ? `\n  ${groups.join("\n  ")}` : ""}`;
		}),
	].join("\n"));
}

function formatVersions(catalog: Catalog, refreshed: RefreshedCatalog, activePiVersion: string): string {
	const latestByName = new Map(Object.entries(refreshed.publishedVersions).map(([name, versions]) => [name, versions[0]?.version]));
	const lines = catalog.packages.map((pkg) => {
		const latest = latestByName.get(pkg.name);
		return `${pkg.name}  bundled ${pkg.version}  latest ${latest ?? "unavailable"}`;
	});
	if (refreshed.piLatestVersion) lines.unshift(`Pi  active ${activePiVersion}  latest ${refreshed.piLatestVersion}`);
	else lines.unshift(`Pi  active ${activePiVersion}  latest unavailable`);
	if (refreshed.warnings.length > 0) lines.push(`Warnings: ${refreshed.warnings.join("; ")}`);
	return bounded(lines.join("\n"));
}

function formatConfig(state: ManagedPithosState, exists: boolean): string {
	const toolchains = Object.entries(state.toolchains).sort(([a], [b]) => a.localeCompare(b));
	const packages = Object.entries(state.packages).sort(([a], [b]) => a.localeCompare(b));
	return bounded([
		`.pithos: ${exists ? "valid" : "not present (Atlas can create it)"}`,
		"Configured toolchains:",
		...(toolchains.length > 0 ? toolchains.map(([name, version]) => `  ${name}: ${version}`) : ["  none"]),
		`Configured Pi: ${state.piVersion ?? "not set"}`,
		"Configured pithos-kit packages:",
		...(packages.length > 0 ? packages.map(([name, version]) => `  ${name}: npm:${version}`) : ["  none"]),
	].join("\n"));
}

function formatDoctor(report: DiagnosticsReport, warnings: string[]): string {
	const lines = [
		`Pi active: ${report.activePiVersion}`,
		`Pi configured for rebuild: ${report.configuredPiVersion ?? "not set"}`,
		...report.packages.map((pkg) => [
			pkg.name,
			`bundled=${pkg.bundledVersion ?? "unknown"}`,
			`configured=${pkg.configuredVersion ?? "none"}`,
			`loaded=${pkg.loadedVersion ?? "not detected"}`,
			`latest=${pkg.latestVersion ?? "unavailable"}`,
			`recommended=${pkg.recommendedVersion ?? "none"}`,
			pkg.compatibleWithActivePi === false ? "ACTIVE PI INCOMPATIBLE" : undefined,
			pkg.compatibleWithConfiguredPi === false ? "CONFIGURED PI INCOMPATIBLE" : undefined,
		].filter(Boolean).join("  ")),
	];
	if (warnings.length > 0) lines.push(`Registry warnings: ${warnings.join("; ")}`);
	return bounded(lines.join("\n"));
}

export function registerAtlas(pi: ExtensionAPI): void {
	registerCommitWorkflow(pi);
	registerSessionNaming(pi);

	const enforceKebabCaseSessionName = (name: string | undefined): void => {
		if (!name || KEBAB_CASE_SESSION_NAME_RE.test(name)) return;
		pi.setSessionName(toKebabCaseSessionName(name));
	};
	pi.on("session_info_changed", (event) => enforceKebabCaseSessionName(event.name));
	pi.on("session_start", () => enforceKebabCaseSessionName(pi.getSessionName()));

	pi.registerTool({
		name: "rename_session",
		label: "Rename Session",
		description: "Set a lowercase kebab-case display name for the current Pi session when the user explicitly asks for a rename.",
		promptSnippet: "Rename the current Pi session in lowercase kebab-case when explicitly requested",
		promptGuidelines: ["Use rename_session only when the user explicitly asks to name or rename the current Pi session, and always provide the name in lowercase kebab-case."],
		parameters: RENAME_SESSION_PARAMETERS,
		async execute(_toolCallId, request: RenameSessionRequest) {
			const name = request.name.trim();
			if (!KEBAB_CASE_SESSION_NAME_RE.test(name)) {
				throw new Error("Session name must use lowercase kebab-case");
			}
			pi.setSessionName(name);
			return {
				content: [{ type: "text", text: `Session renamed to: ${name}` }],
				details: { name },
			};
		},
	});

	const activePiVersion = resolveActivePiVersion({ entrypoint: process.argv[1], fallbackVersion: VERSION });
	const catalog = loadBundledCatalog();
	const registry = new RegistryClient({ offline: isOfflineEnvironment() });

	const runtime = () => observeRuntime(catalog.packages, pi.getCommands(), pi.getAllTools());
	const refreshed = (signal?: AbortSignal, refresh = false, includeVersionHistory = false) =>
		refreshCatalog(catalog, registry, { signal, refresh, includeVersionHistory });
	const doctor = async (cwd: string, signal?: AbortSignal, refresh = false) => {
		const [config, registryState, runtimePackages] = await Promise.all([
			readConfig(cwd),
			refreshed(signal, refresh, true),
			runtime(),
		]);
		return {
			report: buildDiagnostics({
				activePiVersion,
				configuredPiVersion: config.state.piVersion,
				bundled: catalog.packages,
				publishedVersions: registryState.publishedVersions,
				configuredPackages: config.state.packages,
				runtimePackages,
			}),
			warnings: registryState.warnings,
		};
	};

	pi.registerTool({
		name: "pithos_info",
		label: "Pithos Info",
		description: "Read pithos-kit package, version, runtime, compatibility, and .pithos configuration information.",
		promptSnippet: "Inspect pithos-kit packages and configuration without changing files.",
		promptGuidelines: ["Use pithos_info only for read-only inspection. Configuration changes require the user's interactive /pithos config command."],
		parameters: INFO_PARAMETERS,
		async execute(_toolCallId, request: InfoRequest, signal, _onUpdate, ctx) {
			try {
				if (request.action === "catalog") {
					const packages = selectPackage(catalog.packages, request.package);
					const observations = (await runtime()).filter(({ name }) => !request.package || name === request.package);
					return { content: [{ type: "text", text: formatCatalog(packages, observations) }], details: { packages, runtime: observations } };
				}
				if (request.action === "runtime") {
					const observations = selectPackage(await runtime(), request.package);
					return { content: [{ type: "text", text: bounded(JSON.stringify(observations, null, 2)) }], details: { runtime: observations } };
				}
				if (request.action === "config") {
					const config = await readConfig(ctx.cwd);
					return { content: [{ type: "text", text: formatConfig(config.state, config.snapshot.exists) }], details: { exists: config.snapshot.exists, state: config.state } };
				}
				if (request.action === "versions") {
					const state = await refreshed(signal, request.refresh);
					const packages = selectPackage(state.packages, request.package);
					return { content: [{ type: "text", text: formatVersions({ ...catalog, packages }, state, activePiVersion) }], details: { packages, piLatestVersion: state.piLatestVersion, warnings: state.warnings } };
				}
				const state = await doctor(ctx.cwd, signal, request.refresh);
				return { content: [{ type: "text", text: formatDoctor(state.report, state.warnings) }], details: state };
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				return { content: [{ type: "text", text: bounded(message) }], details: { error: message }, isError: true };
			}
		},
	});

	const runCommand = async (command: AtlasCommand, ctx: ExtensionCommandContext): Promise<void> => {
		if (command.action === "menu") {
			if (ctx.mode !== "tui") {
				emitText(ctx, ATLAS_HELP);
				return;
			}
			const choice = await ctx.ui.select("Pithos Atlas", ["About", "Doctor", "Configure"]);
			const selected: Record<string, AtlasCommand> = {
				About: { action: "help" },
				Doctor: { action: "doctor", refresh: false },
				Configure: { action: "config" },
			};
			if (choice) await runCommand(selected[choice], ctx);
			return;
		}
		if (command.action === "help") {
			emitText(ctx, ATLAS_HELP);
			return;
		}
		if (command.action === "packages") {
			emitText(ctx, formatCatalog(catalog.packages, await runtime()));
			return;
		}
		if (command.action === "versions") {
			const state = await refreshed(ctx.signal, command.refresh);
			emitText(ctx, formatVersions(catalog, state, activePiVersion), state.warnings.length > 0 ? "warning" : "info");
			return;
		}
		if (command.action === "config-validate") {
			const config = await readConfig(ctx.cwd);
			emitText(ctx, formatConfig(config.state, config.snapshot.exists));
			return;
		}
		if (command.action === "doctor") {
			const state = await doctor(ctx.cwd, ctx.signal, command.refresh);
			emitText(ctx, formatDoctor(state.report, state.warnings), state.warnings.length > 0 ? "warning" : "info");
			return;
		}

		if (ctx.mode !== "tui" || !ctx.hasUI || !ctx.isProjectTrusted()) {
			emitText(ctx, "/pithos config requires a trusted interactive TUI.", "error");
			return;
		}
		await ctx.waitForIdle();
		if (planModeState(ctx.sessionManager.getBranch()) !== "inactive") {
			emitText(ctx, "/pithos config is unavailable while Plan mode is active or indeterminate.", "error");
			return;
		}

		try {
			const snapshot = await readConfigSnapshot(join(ctx.cwd, ".pithos"));
			parsePithosConfig(snapshot.content);
			const registryState = await refreshed(ctx.signal, false, true);
			if (registryState.warnings.length > 0) {
				ctx.ui.notify("Some registry data is unavailable; Atlas is using its bundled catalog where needed.", "warning");
			}
			const staged = await runConfigWizard(ctx.ui, {
				source: snapshot.content,
				activePiVersion,
				latestPiVersion: registryState.piLatestVersion,
				packages: registryState.packages,
				publishedVersions: registryState.publishedVersions,
			});
			if (!staged) return;
			const guard = () => {
				if (!ctx.isProjectTrusted() || !(ctx.isIdle?.() ?? true) || planModeState(ctx.sessionManager.getBranch()) !== "inactive") {
					throw new Error("Atlas safety state changed before commit; .pithos was not written");
				}
			};
			const changed = await commitConfig(snapshot, staged, undefined, guard);
			ctx.ui.notify(changed
				? "Updated .pithos. Rebuild/restart Pithos to use the new Pi and package pins."
				: "No .pithos changes were written.", "info");
		} catch (error) {
			emitText(ctx, error instanceof Error ? error.message : String(error), "error");
		}
	};

	pi.registerCommand("pithos", {
		description: "Explore pithos-kit packages, diagnose versions, and manage .pithos interactively",
		getArgumentCompletions(prefix) {
			const values = ["help", "packages", "versions", "versions --refresh", "doctor", "doctor --refresh", "config", "config validate"];
			return values.filter((value) => value.startsWith(prefix)).map((value) => ({ value, label: value }));
		},
		async handler(args, ctx) {
			try {
				await runCommand(parseAtlasCommand(args), ctx);
			} catch (error) {
				emitText(ctx, error instanceof Error ? error.message : ATLAS_HELP, "error");
			}
		},
	});
}
