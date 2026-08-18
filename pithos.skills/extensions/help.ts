import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

type SkillsHelpCommand = "srs" | "skill:tdd";

const SKILLS_COMMAND_HELP: Record<SkillsHelpCommand, string> = {
	srs: `Usage: /srs <request>

Elicit, draft, approve, and write an ISO/IEC/IEEE 29148-style Software Requirements Specification with EARS requirements.

Options:
  --help, -h  Show this help`,
	"skill:tdd": `Usage: /skill:tdd [task context]

Load the test-driven development workflow. Optional task context is appended to the skill instructions.

Options:
  --help, -h  Show this help`,
};

function skillsCommandHelp(input: string): string | undefined {
	const match = input.trim().match(/^\/(srs|skill:tdd)\s+(?:--help|-h)$/u);
	return match ? SKILLS_COMMAND_HELP[match[1] as SkillsHelpCommand] : undefined;
}

function emitHelp(ctx: ExtensionContext, help: string): void {
	if (ctx.hasUI) ctx.ui.notify(help, "info");
	else console.log(help);
}

export default function skillsHelp(pi: ExtensionAPI): void {
	pi.on("input", async (event, ctx) => {
		if (event.source === "extension") return { action: "continue" as const };

		const help = skillsCommandHelp(event.text);
		if (!help) return { action: "continue" as const };

		emitHelp(ctx, help);
		return { action: "handled" as const };
	});
}
