# guild

A standalone Guild of .NET and Angular architecture and implementation members for [pi](https://github.com/earendil-works/pi-mono).

The extension adds an agent-callable `guild_handover` tool and an interactive `/guild-handover` command for direct user delegation. Every handover starts an isolated, ephemeral pi process with a focused system prompt and a hard tool allowlist. The child inherits the parent session's active provider, model, thinking level, working directory, and project-trust decision.

## Install

```bash
pi install npm:@anton-kochev/pithos.guild
```

For local development from this repository:

```bash
pi install ./pithos.guild
pi install ./pithos.guild -l   # project-local
```

Temporary test run:

```bash
pi -e ./pithos.guild
```

## Guild members

| Member | Role | Tools |
|---|---|---|
| `dotnet-architect` | Read-only .NET architecture, reviews, contracts, test plans, and implementation handoffs | `read`, `grep`, `find`, `ls` |
| `frontend-architect` | Read-only front-end architecture, state ownership, boundaries, routing, rendering, and API contracts | `read`, `grep`, `find`, `ls` |
| `csharp-coder` | Scoped C#/.NET implementation, related tests, builds, and verification | `read`, `grep`, `find`, `ls`, `edit`, `write`, `bash` |
| `angular-coder` | Scoped Angular implementation, related tests, type-checking, linting, and builds | `read`, `grep`, `find`, `ls`, `edit`, `write`, `bash` |

Architect members cannot edit files or run shell commands. Coder members own related tests and verification and must not report success when relevant checks fail.

## Usage

Ask the main agent to hand a self-contained task over to a Guild member:

```text
Use dotnet-architect to design the order cancellation workflow.
Use frontend-architect to define state ownership for checkout.
Use csharp-coder to implement the approved cancellation design.
Use angular-coder to add the checkout loading and error states.
```

The main agent invokes:

```text
guild_handover({ member: "csharp-coder", task: "...scope and acceptance criteria..." })
```

Delegate directly from the interactive TUI without asking the main agent to invoke the tool:

```text
/guild-handover
/guild-handover csharp-coder
/guild-handover csharp-coder Implement validation and run the tests
```

With no member, the command opens a roster picker. With no task, it opens a multiline task editor. The command waits for the main agent to become idle, applies the same member discovery and project-override approval as the tool, and then runs synchronously in a cancellable live handover card. Direct command execution is intentionally TUI-only.

List the active roster and definition sources without executing a member:

```text
/guild
```

## Live transparency

While Guild members are executing, the extension shows a themed, framed operations card above the editor:

```text
────────────────────────────────────────────────────────
✦ Guild Operations  2 active

● RUNNING  dotnet-architect · builtin · READ ONLY · 5s
  ↳ Design order cancellation
  ◇ openai-codex/gpt-5.6-sol · thinking xhigh · 2 turns
  ⚙ read, grep, find, ls

● RUNNING  angular-coder · project · WRITE ENABLED · 3s
  ↳ Implement checkout loading state
  ◇ openai-codex/gpt-5.6-sol · thinking xhigh
  ⚙ read, grep, find, ls, edit, write, bash

────────────────────────────────────────────────────────
```

Colors follow the active Pi theme: accent framing, amber running states, and muted metadata. `guild_handover` also has a custom tool-call card and a compact completion card whose full output is available through normal tool expansion.

Agent-invoked handovers use the aggregate dashboard shown above. A direct `/guild-handover` instead uses a compact, width-capped live card with a spinner, elapsed time, turns, current child-tool activity, and the configured cancellation hint:

```text
╭─ ✦ Guild Relay ───────────────────────────────────────────────────────── [● Running  00:12] ─╮
│  dotnet-architect · built-in · read-only                                                     │
│  Request  Explore the repository for .NET artifacts                                          │
│  ⠋  Scanning repository · find · 2 turns                               escape/ctrl+c cancel  │
╰──────────────────────────────────────────────────────────────────────────────────────────────╯
```

The activity label is derived from actual child tool events rather than an invented progress percentage. Completed reports render as Markdown in a neutral framed card; failed runs receive a diagnostics section, and cancellations use a compact terminal treatment.

While agent-invoked work is running, the footer reports the active count and the aggregate panel updates elapsed time and turns. Each stopped Guild member is removed from that live panel immediately. When the final active run stops, the `guild-dashboard` panel and footer status clear. Completed output and metadata remain on the corresponding tool result or direct-handover lifecycle message in the transcript.

A direct handover records a user-initiated `started` event and exactly one correlated terminal event. The started event is hidden visually because the live card already communicates progress, but both events remain available to the main agent on its next turn. They use `triggerTurn: false`, so completion never causes an automatic main-agent response. Member reports and failure diagnostics are explicitly delimited as task data rather than new instructions. Selection/editor cancellation creates no event; cancellation after execution starts records a terminal `cancelled` event.

Guild is independent of Pi's native specialist facility and does not observe its tool lifecycle or messages.

The first release intentionally supports one Guild member per invocation. Parallel tasks, chains, persistent member memory, and dedicated reviewer/test-writer members are out of scope.

## Guild member overrides

The package always provides its four built-in definitions. You can override a definition by creating a Markdown agent file in:

- User scope: `~/.pi/agent/agents/*.md`
- Project scope: `.pi/agents/*.md` in the current directory or an ancestor

Precedence is:

```text
project → user → built-in
```

Project definitions are considered only in trusted projects. Handing a task to a selected project override also requires explicit interactive confirmation; it is rejected when no UI is available.

An override uses this format:

```markdown
---
name: csharp-coder
description: Project-specific C# Guild member.
tools: read, grep, find, ls, edit, write, bash
---

Your project-specific Guild member instructions.
```

Names are limited to the bundled roster. Tool boundaries are hard policy: an override whose tools differ from the corresponding built-in role is ignored. This prevents an architect prompt from gaining write or shell access.

## Isolation and resources

Each Guild member runs with:

- an isolated context window and no saved child session;
- the parent's current provider/model and thinking level;
- the Guild member's fixed tool allowlist;
- the parent's working directory and trust decision;
- normal trusted project context and skill discovery;
- extension discovery disabled in the child, preventing recursive delegation and unrelated extension behavior.

Cancellation terminates the child process and waits for it to stop before returning control. Model-visible output is capped at 50 KB; full output and run metadata remain in tool-result or lifecycle-message details.

## Development

```bash
cd pithos.guild
npm install
npm test
npm run typecheck
npm pack --dry-run
```

## Provenance

The bundled Guild member prompts are adapted for pi from the MIT-licensed [Grimoire](https://github.com/anton-kochev/grimoire) project. See [`NOTICE.md`](./NOTICE.md).
