# Translate behavior list

## Commands and help
- [x] Parse an empty command as manual translation and recognize `on`, `off`, `status`, `config`, `--help`, and `-h`.
- [x] Suggest `on`, `off`, `status`, `config`, and `--help` through Pi command argument autocomplete, filtering the single argument by prefix.
- [x] Reject unsupported arguments with package-local usage.

## Scoped configuration
- [x] Strictly validate a non-empty single-line language, exact `provider/model-id`, model IDs containing further slashes, and manual/automatic mode.
- [x] Resolve this command's canonical user/project/temporary source scope and fail closed on ambiguous provenance.
- [x] Load and atomically persist only `~/.pi/agent/translate.json` or `<cwd>/.pi/translate.json` for the active scope; keep source/cwd-isolated temporary settings for the process lifetime.
- [x] Complete or cancel a language/model wizard using a compact labeled single-line language field with an example placeholder and authenticated available models, without partial writes.
- [x] Treat `/translate off` without valid configuration as already off, without launching setup or writing state.

## Assistant selection and Markdown safety
- [x] Select only `stop`-completed assistant prose without tool calls and normalize each block with Pi's rendered `trim()`.
- [x] Find the latest eligible assistant response on the active branch for manual translation.
- [x] Protect and byte-exactly restore backtick/tilde LF/CRLF fenced code, inline code, inline/reference/defined-shortcut links, autolinks, and bare URLs.
- [x] Reject missing, duplicated, malformed, or invented protection placeholders.

## Translation model boundary
- [x] Resolve only the exact configured authenticated model; never fall back to the active model.
- [x] Build a faithful translation-only prompt that treats source instructions as data, forbids additions or omissions, safely quotes the target language, propagates cancellation, normalizes failures, and preserves usage from success and model-returned failure responses without inventing it for pre-response failures.

## Manual behavior
- [x] Append a durable context-free themed Markdown card for a successful manual translation.
- [x] Leave history unchanged and append nothing on cancellation or failure.

## Automatic behavior
- [x] Suppress only streaming assistant prose while automatic mode is active.
- [x] Suppress streaming prose without an inline placeholder while leaving main-model generation to Pi's own working indicator.
- [x] Start a keyed, animated footer naming the target language and model in `message_end`, only after terminal-message eligibility and immediately before the first non-skipped translation request; keep it through every block request.
- [x] Never show Translate's footer for tool-calling, errored, length-stopped, empty, non-TUI, or all-Mermaid-skipped messages, and clear an active footer on success, failure, cancellation, mode changes, branch/session changes, and shutdown.
- [x] Translate finalized eligible prose, cache block substitutions, and never replace the assistant message.
- [x] Reveal the original response when translation fails or is cancelled and persist suppression tombstones that invalidate stale translations for repeated source blocks while aggregating any model-returned failure usage.
- [x] Persist translated and deliberately skipped block outcomes on the source message's corresponding `turn_end`, including queued-turn and branch handling.
- [x] Restore valid current records and legacy translation-only records from the active branch, substituting or suppressing finalized assistant Markdown display-only.
- [x] Prefix every successful automatic block immediately and after resume with an italic `Translated · <target language>` display-only marker generated from persisted metadata, safely collapsing and escaping arbitrary language text without changing messages, record bodies, failures, suppressions, thinking/user output, or manual cards.
- [x] Handle multiple blocks and repeated source text deterministically.
- [x] Leave Mermaid-containing blocks original without a model call and persist their suppression alongside translated blocks because Pi's built-in Mermaid transformer runs first.
- [x] Keep output available to later transformers and document that Translate must precede arbitrary display-transforming extensions.
- [x] Make no manual or automatic translation model call outside interactive TUI mode.

## Package
- [x] Publish `@pithos-kit/translate` v0.1.0 for Pi >=0.84.0 with the documented extension entry, scripts, and packed files.
- [x] Document that Translate neither enforces English nor modifies Pi prompts/context; language policy remains in user/project instructions.
