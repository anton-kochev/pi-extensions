# context-bar

A thin, stacked context-window composition bar for [pi](https://github.com/earendil-works/pi-mono), rendered directly above the editor.

```text
▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀────────────────────────42%
```

The real bar uses a harmonious theme-aware color progression and spans the terminal width. Used context renders as upper-half `▀` blocks, while free capacity renders as a thin `─` line matching the editor's current border color. This leaves balanced spacing around the input cursor. While enabled, context-bar removes Pi's separate top-border row; disabling the bar restores it. Its only inline text is a normal-size integer percentage at the far right.

## Install

Context Bar requires Pi `0.84.1` or later. Do not add it to a Pithos environment still pinned to Pi `0.83.0`; Atlas will report that combination as incompatible.

```bash
pi install npm:@pithos-kit/context-bar
```

For local development:

```bash
pi install -l ./pithos.context-bar
```

## Pithos `.pithos` config

```yaml
pi:
  extensions:
    "@pithos-kit/context-bar": "npm:0.1.0"
```

## Commands

| Command | Action |
|---|---|
| `/context-bar` | Toggle the bar |
| `/context-bar on` | Enable it |
| `/context-bar off` | Disable it |
| `/context-bar status` | Show the legend, estimated counts, model/window, and estimation basis |
| `/context-bar --help` | Show command usage without changing bar state |

`-h` is also accepted.

New sessions start enabled. Explicit changes are stored as non-context entries on the active session branch, so they survive reload, resume, and fork without creating project or global configuration.

## Segments

Segments always appear in this order:

| Segment | Includes | Pi theme color |
|---|---|---|
| **Prompt** | Pi's base prompt, custom/append prompts, working directory, and extension prompt changes | Violet (`customMessageLabel`) |
| **Project context** | Loaded `AGENTS.md`, `CLAUDE.md`, and related project instruction context | Blue (`mdLink`) |
| **Skills** | Skill catalogue metadata, explicit `/skill:*` expansions, and recognized skill-file read results | Teal (`accent`) |
| **Tools** | Active definitions/schemas, prompt guidance, calls, arguments, results, and context-visible shell output | Green (`success`) |
| **Conversation** | User content, prompt templates, images, assistant text/thinking, summaries, and custom context messages | Amber (`mdHeading`) |
| **Other** | Provider framing, serialization differences, extension rewrites, and estimation residual | Gray (`muted`) |
| **Free** | Remaining context capacity | Thin line matching the current editor border (`borderMuted` fallback) |

The violet → blue → teal → green → amber progression adapts to Pi's dark, light, and custom themes. Free capacity follows the editor border as its mode/thinking color changes. The percentage uses the same dim theme color as Pi's footer path; it does not change color at thresholds.

## Accuracy

Pi exposes aggregate context usage, but not exact additive token counts by source. The colored composition is therefore an estimate:

- Text uses Pi-compatible conservative character-based token estimation.
- Images use Pi's fixed image estimate.
- A current provider aggregate is preferred only when it belongs to the selected model and matches the effective prompt/tool fingerprint; changed requests fall back to the safer local estimate.
- Positive unexplained residual is assigned to **Other**; overestimates are proportionally reconciled.
- Startup, model-switch, and post-compaction states use a complete local estimate until correlated provider usage is available.

`/context-bar status` identifies the current basis as `provider-backed total` or `local estimate`. The extension persists only the enabled/disabled boolean. While enabled, it reads Pi's in-memory prompt, context, and schema objects to recompute the bar; it clears its references when disabled or shut down and never writes or logs those inputs or provider payloads.

Tiny categories may occupy less than one terminal cell and disappear from the passive bar rather than being visually exaggerated. They remain visible in `/context-bar status`.

## Development

Requires Node.js 22.19 or later and Pi 0.84.1 or later. This minimum includes upstream fixes for the dependency advisories affecting Pi 0.83.0.

```bash
npm install
npm test
npm run audit
npm run typecheck
npm pack --dry-run
```
