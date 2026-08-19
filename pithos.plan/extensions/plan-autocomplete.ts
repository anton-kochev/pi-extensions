import type { AutocompleteItem, AutocompleteProvider } from "@earendil-works/pi-tui";

const PLAN_ARGUMENTS: AutocompleteItem[] = [
	{
		value: "exit",
		label: "exit",
		description: "Exit active Plan mode without creating a plan",
	},
	{
		value: "cancel",
		label: "cancel",
		description: "Alias for exit",
	},
	{
		value: "--help",
		label: "--help",
		description: "Show Plan command usage",
	},
	{
		value: "-h",
		label: "-h",
		description: "Alias for --help",
	},
];

function planArgumentPrefix(textBeforeCursor: string): string | undefined {
	return /^\/plan\s+([^\s]*)$/.exec(textBeforeCursor)?.[1];
}

export function createPlanArgumentAutocompleteProvider(current: AutocompleteProvider): AutocompleteProvider {
	return {
		async getSuggestions(lines, cursorLine, cursorCol, options) {
			const currentLine = lines[cursorLine] ?? "";
			const prefix = planArgumentPrefix(currentLine.slice(0, cursorCol));
			if (prefix === undefined) return current.getSuggestions(lines, cursorLine, cursorCol, options);

			const normalizedPrefix = prefix.toLowerCase();
			const items = PLAN_ARGUMENTS.filter((item) => item.value.startsWith(normalizedPrefix));
			if (items.length === 0) return current.getSuggestions(lines, cursorLine, cursorCol, options);
			return { prefix, items };
		},
		applyCompletion(lines, cursorLine, cursorCol, item, prefix) {
			return current.applyCompletion(lines, cursorLine, cursorCol, item, prefix);
		},
		shouldTriggerFileCompletion(lines, cursorLine, cursorCol) {
			const currentLine = lines[cursorLine] ?? "";
			if (planArgumentPrefix(currentLine.slice(0, cursorCol)) !== undefined) return true;
			return current.shouldTriggerFileCompletion?.(lines, cursorLine, cursorCol) ?? true;
		},
	};
}
