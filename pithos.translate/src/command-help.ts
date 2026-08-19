export type TranslateCommand =
  | { type: "manual" }
  | { type: "on" }
  | { type: "off" }
  | { type: "status" }
  | { type: "config" }
  | { type: "help" }
  | { type: "error"; message: string };

export const TRANSLATE_HELP = `Usage: /translate [on|off|status|config|--help]

Without an argument, translate the latest completed assistant response into a manual translation card.
Use on to enable automatic display-only translation for future eligible assistant prose.

Commands:
  on      Enable automatic display-only translation
  off     Disable automatic translation; keep /translate available manually
  status  Show the active scope and settings
  config  Choose a target language and exact translation model

Options:
  --help, -h  Show this help`;

export function parseTranslateCommand(rawArgs: string): TranslateCommand {
  const argument = rawArgs.trim().toLowerCase();
  if (argument === "") return { type: "manual" };
  if (argument === "on" || argument === "off" || argument === "status" || argument === "config") {
    return { type: argument };
  }
  if (argument === "--help" || argument === "-h") return { type: "help" };
  return { type: "error", message: `Unknown /translate argument: ${rawArgs.trim()}` };
}
