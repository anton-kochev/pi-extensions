import { DynamicBorder, type Theme } from "@earendil-works/pi-coding-agent";
import { Box, Container, Spacer, Text, type Component } from "@earendil-works/pi-tui";

interface ToolResultLike {
	content?: Array<{ type: string; text?: string }>;
	details?: any;
}

interface LifecycleMessageLike {
	content?: string | Array<{ type: string; text?: string }>;
	details?: any;
}

function compact(value: string, maxLength = 100): string {
	const text = value.replace(/\s+/g, " ").trim();
	return text.length <= maxLength ? text : `${text.slice(0, maxLength - 1)}…`;
}

function styledPanelLine(line: string, theme: Theme): string {
	if (line.startsWith("⏳ ")) {
		const text = line
			.replace(/^⏳\s*/, "● RUNNING  ")
			.replace("read-only", "READ ONLY")
			.replace("write-enabled", "WRITE ENABLED");
		return theme.fg("warning", theme.bold(text));
	}
	if (line.trimStart().startsWith("Task:")) {
		return theme.fg("text", line.replace("Task:", "↳"));
	}
	if (line.trimStart().startsWith("Model:")) {
		return theme.fg("muted", line.replace("Model:", "◇"));
	}
	if (line.trimStart().startsWith("Tools:")) {
		return theme.fg("dim", line.replace("Tools:", "⚙"));
	}
	return theme.fg("muted", line);
}

export function createGuildPanel(lines: string[], theme: Theme): Component {
	const root = new Container();
	root.addChild(new DynamicBorder((text: string) => theme.fg("borderAccent", text)));

	const box = new Box(1, 0, (text: string) => theme.bg("toolPendingBg", text));
	const summary = lines[0]?.replace(/^Guild\s*·?\s*/, "") ?? "";
	box.addChild(new Text(
		theme.fg("accent", theme.bold(`✦ Guild Operations${summary ? `  ${summary}` : ""}`)),
		0,
		0,
	));

	for (const line of lines.slice(1)) {
		if (line.startsWith("⏳ ")) {
			box.addChild(new Spacer(1));
		}
		box.addChild(new Text(styledPanelLine(line, theme), 0, 0));
	}

	root.addChild(box);
	root.addChild(new DynamicBorder((text: string) => theme.fg("borderMuted", text)));
	return root;
}

export function renderGuildCall(args: { member?: string; task?: string }, theme: Theme): Component {
	const container = new Container();
	container.addChild(new Text(
		theme.fg("toolTitle", theme.bold("✦ Guild  ")) +
			theme.fg("accent", args.member ?? "selecting…"),
		0,
		0,
	));
	container.addChild(new Text(theme.fg("muted", `↳ ${compact(args.task ?? "Preparing delegated task…")}`), 0, 0));
	return container;
}

function resultText(result: ToolResultLike): string {
	return result.content
		?.filter((part) => part.type === "text" && typeof part.text === "string")
		.map((part) => part.text)
		.join("\n") ?? "";
}

function usageText(details: any): string {
	const parts: string[] = [];
	if (details?.elapsedMs !== undefined) parts.push(`${(details.elapsedMs / 1000).toFixed(1)}s`);
	if (details?.usage?.turns) parts.push(`${details.usage.turns} turn${details.usage.turns === 1 ? "" : "s"}`);
	if (details?.usage?.cost) parts.push(`$${Number(details.usage.cost).toFixed(4)}`);
	return parts.join(" · ");
}

export function renderGuildLifecycleMessage(
	message: LifecycleMessageLike,
	options: { expanded?: boolean; outputPad?: number },
	theme: Theme,
): Component {
	const details = message.details;
	const status = details?.status ?? "started";
	const presentation: {
		icon: string;
		label: string;
		color: "success" | "error" | "muted" | "warning";
		background: "toolSuccessBg" | "toolErrorBg" | "customMessageBg" | "toolPendingBg";
	} = status === "completed"
		? { icon: "✓", label: "Completed", color: "success", background: "toolSuccessBg" }
		: status === "failed"
			? { icon: "✗", label: "Failed", color: "error", background: "toolErrorBg" }
			: status === "cancelled"
				? { icon: "■", label: "Cancelled", color: "muted", background: "customMessageBg" }
				: { icon: "●", label: "Started", color: "warning", background: "toolPendingBg" };
	const member = details?.member ?? "guild member";
	const box = new Box(1, 0, (text: string) => theme.bg(presentation.background, text));

	box.addChild(new Text(theme.fg("toolTitle", theme.bold("✦ Guild Handover")), 0, 0));
	box.addChild(new Text(
		theme.fg(presentation.color, theme.bold(`${presentation.icon} ${presentation.label}  `)) +
			theme.fg("accent", member),
		0,
		0,
	));

	const metadata = [
		details?.initiatedBy === "user" ? "USER INITIATED" : undefined,
		details?.memberSource,
		details?.role === "architect" ? "READ ONLY" : details?.role === "coder" ? "WRITE ENABLED" : undefined,
		usageText(details),
	].filter(Boolean).join(" · ");
	if (metadata) box.addChild(new Text(theme.fg("dim", metadata), 0, 0));
	if (details?.task) box.addChild(new Text(theme.fg("muted", `↳ ${compact(details.task, 140)}`), 0, 0));

	const output = status === "failed" ? details?.error : details?.output;
	if (output) {
		box.addChild(new Spacer(1));
		if (options.expanded) {
			box.addChild(new Text(theme.fg(status === "failed" ? "error" : "toolOutput", output.trim()), 0, 0));
		} else {
			const previewLines = output.trim().split("\n").slice(0, 4);
			box.addChild(new Text(theme.fg(status === "failed" ? "error" : "toolOutput", previewLines.join("\n")), 0, 0));
			if (output.trim().split("\n").length > previewLines.length) {
				box.addChild(new Text(theme.fg("dim", "… expand for full guild member output"), 0, 0));
			}
		}
	}

	if (options.expanded) {
		const diagnostics = [
			details?.runId ? `Run: ${details.runId}` : undefined,
			details?.inheritedModel ? `Model: ${details.inheritedModel}` : undefined,
			details?.thinkingLevel ? `Thinking: ${details.thinkingLevel}` : undefined,
		].filter(Boolean);
		if (diagnostics.length > 0) {
			box.addChild(new Spacer(1));
			box.addChild(new Text(theme.fg("dim", diagnostics.join(" · ")), 0, 0));
		}
	}

	return box;
}

export function renderGuildResult(
	result: ToolResultLike,
	options: { expanded?: boolean; isPartial?: boolean },
	theme: Theme,
	context?: { isError?: boolean },
): Component {
	const details = result.details;
	const output = details?.output || resultText(result);
	const running = options.isPartial || details?.status === "running";
	const failed = context?.isError || details?.status === "failed";
	const icon = running ? "●" : failed ? "✗" : "✓";
	const label = running ? "Running" : failed ? "Failed" : "Completed";
	const color = running ? "warning" : failed ? "error" : "success";
	const member = details?.member ?? "guild member";

	const container = new Container();
	container.addChild(new Text(
		theme.fg(color, theme.bold(`${icon} ${label}  `)) + theme.fg("accent", member),
		0,
		0,
	));

	const metadata = [
		details?.memberSource,
		details?.role === "architect" ? "READ ONLY" : details?.role === "coder" ? "WRITE ENABLED" : undefined,
		usageText(details),
	].filter(Boolean).join(" · ");
	if (metadata) container.addChild(new Text(theme.fg("dim", metadata), 0, 0));

	if (output) {
		container.addChild(new Spacer(1));
		if (options.expanded) {
			container.addChild(new Text(theme.fg("toolOutput", output.trim()), 0, 0));
		} else {
			const previewLines = output.trim().split("\n").slice(0, 4);
			container.addChild(new Text(theme.fg("toolOutput", previewLines.join("\n")), 0, 0));
			if (output.trim().split("\n").length > previewLines.length) {
				container.addChild(new Text(theme.fg("dim", "… expand for full guild member output"), 0, 0));
			}
		}
	}
	return container;
}
