export const ANSWER_HELP = `Usage: /answer

Extract questions from the last completed assistant response, collect answers in the interactive TUI, and submit them as a user message.

Options:
  --help, -h  Show this help`;

export function getAnswerCommandHelp(args: string): string | undefined {
	const normalized = args.trim();
	return normalized === "--help" || normalized === "-h" ? ANSWER_HELP : undefined;
}
