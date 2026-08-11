export type EchoCommandName = "ask" | "ask-clear" | "asked";

export const ASK_HELP = `Usage: /ask [options] [--] question

Ask an isolated side-channel pi process. Echo receives progressive read-only access to the current session and only has read-only tools: read, grep, find, ls. The answer is shown to you and saved in Echo history, but it is not injected into the main agent context.

Options:
  --model <model>     Use a specific model (default: current model)
  --help, -h          Show this help

Examples:
  /ask what did we decide about the API shape?
  /ask what files have we touched so far?
  /ask --model anthropic/claude-haiku-4-5 summarize the open questions`;

const ECHO_COMMAND_HELP: Record<EchoCommandName, string> = {
	ask: ASK_HELP,
	"ask-clear": `Usage: /ask-clear

Hide any stale Echo answer widget without deleting saved Echo history.

Options:
  --help, -h  Show this help`,
	asked: `Usage: /asked

Browse answers saved by previous /ask commands in the current session.

Options:
  --help, -h  Show this help`,
};

export function getEchoCommandHelp(command: EchoCommandName, args: string): string | undefined {
	const normalized = args.trim();
	return normalized === "--help" || normalized === "-h"
		? ECHO_COMMAND_HELP[command]
		: undefined;
}
