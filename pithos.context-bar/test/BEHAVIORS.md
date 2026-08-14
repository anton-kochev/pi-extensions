# Context bar behavior list

## Context model
- [x] Classify system prompt, project context, skill catalogue, tool metadata, and ordinary conversation without overlap.
- [x] Split explicit skill expansions from trailing user arguments.
- [x] Count assistant tool calls, tool results, and context-visible bash as tools; exclude `!!` bash.
- [x] Attribute recognized skill-file read results to skills.
- [x] Use provider-backed aggregate usage only when it belongs to the active model.
- [x] Reconcile positive provider residual into other and proportionally scale local overestimates.
- [x] Fall back to complete local estimation at startup, after model changes, and after compaction.

## UI
- [x] Allocate segment cells proportionally and deterministically in fixed order.
- [x] Render used context as upper-half-cell `▀` blocks and free capacity as a thin `─` line matching the editor border, with a normal-size integer percentage.
- [x] Preserve the violet → blue → teal → green → amber → gray category sequence with contrast-adapted light and dark variants instead of theme-dependent semantic hues.
- [x] Separate adjacent sections with one terminal-background cell when the preceding section is wide enough, without erasing one-cell sections.
- [x] Keep section interiors uninterrupted and show only the total-used percentage at the right edge.
- [x] Remove the editor's separate top-border row while enabled, leaving matching half-row padding above and below the input cursor, and restore it when disabled.
- [x] Fill exactly the terminal width, keeping percentage text at the right edge.
- [x] Handle zero/narrow widths, zero/full/overflow usage, and tiny segments safely.
- [x] Format a status legend with counts, model/window, and estimation basis.

## Extension
- [x] Register the above-editor widget only in TUI mode and start enabled.
- [x] Toggle with `/context-bar`, and support `on`, `off`, and `status`.
- [x] Persist and restore enabled state from the active session branch.
- [x] Refresh on prompt/context/model/compaction/session lifecycle changes and clean up on shutdown.

## Package
- [x] Publish with the expected npm identity, manifest, files, documentation, local settings entry, and release workflow.
