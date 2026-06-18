#!/usr/bin/env node
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const DEFAULT_PACKAGE_DIR = "/opt/pi-npm/lib/node_modules/@earendil-works/pi-coding-agent";

const args = process.argv.slice(2);
const checkOnly = args.includes("--check");
const packageDir = process.env.PI_CODING_AGENT_DIR
	?? args.find((arg) => !arg.startsWith("-"))
	?? DEFAULT_PACKAGE_DIR;

const patches = [
	{
		file: "dist/core/agent-session.js",
		edits: [
			{
				label: "track original prompt-template invocation as displayText",
				oldText: [
					"            // Expand skill commands (/skill:name args) and prompt templates (/template args)",
					"            let expandedText = currentText;",
					"            if (expandPromptTemplates) {",
					"                expandedText = this._expandSkillCommand(expandedText);",
					"                expandedText = expandPromptTemplate(expandedText, [...this.promptTemplates]);",
					"            }",
					"",
				].join("\n"),
				newText: [
					"            // Expand skill commands (/skill:name args) and prompt templates (/template args)",
					"            let expandedText = currentText;",
					"            let displayText;",
					"            if (expandPromptTemplates) {",
					"                expandedText = this._expandSkillCommand(expandedText);",
					"                const beforeTemplateExpansion = expandedText;",
					"                expandedText = expandPromptTemplate(expandedText, [...this.promptTemplates]);",
					"                if (expandedText !== beforeTemplateExpansion) {",
					"                    displayText = currentText;",
					"                }",
					"            }",
					"",
				].join("\n"),
			},
			{
				label: "persist displayText on user messages",
				oldText: [
					"            messages.push({",
					"                role: \"user\",",
					"                content: userContent,",
					"                timestamp: Date.now(),",
					"            });",
				].join("\n"),
				newText: [
					"            messages.push({",
					"                role: \"user\",",
					"                content: userContent,",
					"                ...(displayText ? { displayText } : {}),",
					"                timestamp: Date.now(),",
					"            });",
				].join("\n"),
			},
		],
	},
	{
		file: "dist/modes/interactive/interactive-mode.js",
		edits: [
			{
				label: "render displayText in TUI user messages",
				oldText: [
					"    /** Extract text content from a user message */",
					"    getUserMessageText(message) {",
					"        if (message.role !== \"user\")",
					"            return \"\";",
					"        const textBlocks = typeof message.content === \"string\"",
					"            ? [{ type: \"text\", text: message.content }]",
					"            : message.content.filter((c) => c.type === \"text\");",
					"        return textBlocks.map((c) => c.text).join(\"\");",
					"    }",
				].join("\n"),
				newText: [
					"    /** Extract text content from a user message */",
					"    getUserMessageText(message) {",
					"        if (message.role !== \"user\")",
					"            return \"\";",
					"        if (typeof message.displayText === \"string\")",
					"            return message.displayText;",
					"        const textBlocks = typeof message.content === \"string\"",
					"            ? [{ type: \"text\", text: message.content }]",
					"            : message.content.filter((c) => c.type === \"text\");",
					"        return textBlocks.map((c) => c.text).join(\"\");",
					"    }",
				].join("\n"),
			},
		],
	},
	{
		file: "dist/core/export-html/template.js",
		edits: [
			{
				label: "render displayText in HTML export",
				oldText: [
					"          if (msg.role === 'user') {",
					"            const content = msg.content;",
					"            const text = typeof content === 'string' ? content :",
					"              content.filter(c => c.type === 'text').map(c => c.text).join('\\n');",
					"            const skillBlock = parseSkillBlock(text);",
				].join("\n"),
				newText: [
					"          if (msg.role === 'user') {",
					"            const content = msg.content;",
					"            const text = typeof msg.displayText === 'string' ? msg.displayText :",
					"              (typeof content === 'string' ? content :",
					"              content.filter(c => c.type === 'text').map(c => c.text).join('\\n'));",
					"            const skillBlock = typeof msg.displayText === 'string' ? null : parseSkillBlock(text);",
				].join("\n"),
			},
		],
	},
	{
		file: "dist/core/session-manager.js",
		edits: [
			{
				label: "use displayText for session first-message previews",
				oldText: [
					"function extractTextContent(message) {",
					"    const content = message.content;",
					"    if (typeof content === \"string\") {",
					"        return content;",
					"    }",
				].join("\n"),
				newText: [
					"function extractTextContent(message) {",
					"    if (message.role === \"user\" && typeof message.displayText === \"string\") {",
					"        return message.displayText;",
					"    }",
					"    const content = message.content;",
					"    if (typeof content === \"string\") {",
					"        return content;",
					"    }",
				].join("\n"),
			},
		],
	},
	{
		file: "dist/modes/interactive/components/tree-selector.js",
		edits: [
			{
				label: "search displayText in tree selector",
				oldText: [
					"                if (\"content\" in msg && msg.content) {",
					"                    parts.push(this.extractContent(msg.content));",
					"                }",
				].join("\n"),
				newText: [
					"                if (msg.role === \"user\" && typeof msg.displayText === \"string\") {",
					"                    parts.push(msg.displayText);",
					"                }",
					"                else if (\"content\" in msg && msg.content) {",
					"                    parts.push(this.extractContent(msg.content));",
					"                }",
				].join("\n"),
			},
			{
				label: "render displayText in tree selector",
				oldText: [
					"                if (role === \"user\") {",
					"                    const msgWithContent = msg;",
					"                    const content = normalize(this.extractContent(msgWithContent.content));",
					"                    result = theme.fg(\"accent\", \"user: \") + content;",
					"                }",
				].join("\n"),
				newText: [
					"                if (role === \"user\") {",
					"                    const msgWithContent = msg;",
					"                    const rawContent = typeof msgWithContent.displayText === \"string\" ? msgWithContent.displayText : this.extractContent(msgWithContent.content);",
					"                    const content = normalize(rawContent);",
					"                    result = theme.fg(\"accent\", \"user: \") + content;",
					"                }",
				].join("\n"),
			},
		],
	},
];

function applyEdit(content, edit, file) {
	if (content.includes(edit.newText)) {
		return { content, status: "already" };
	}
	if (!content.includes(edit.oldText)) {
		throw new Error(`${file}: could not find expected block for ${edit.label}`);
	}
	return { content: content.replace(edit.oldText, edit.newText), status: "patched" };
}

let changedFiles = 0;
let patchedEdits = 0;
let alreadyPatchedEdits = 0;

for (const patch of patches) {
	const filePath = join(packageDir, patch.file);
	if (!existsSync(filePath)) {
		throw new Error(`Pi package file not found: ${filePath}`);
	}

	let content = readFileSync(filePath, "utf8");
	let changed = false;

	for (const edit of patch.edits) {
		const result = applyEdit(content, edit, patch.file);
		content = result.content;
		if (result.status === "patched") {
			patchedEdits += 1;
			changed = true;
		} else {
			alreadyPatchedEdits += 1;
		}
	}

	if (changed) {
		changedFiles += 1;
		if (!checkOnly) writeFileSync(filePath, content, "utf8");
	}
}

if (checkOnly && patchedEdits > 0) {
	console.log(`Patch is needed for ${patchedEdits} edit(s) in ${changedFiles} file(s).`);
	process.exitCode = 1;
} else if (patchedEdits > 0) {
	console.log(`Applied prompt-template display suppression: ${patchedEdits} edit(s) in ${changedFiles} file(s).`);
} else {
	console.log(`Prompt-template display suppression is already applied (${alreadyPatchedEdits} edit(s)).`);
}

console.log(`Pi package: ${packageDir}`);
