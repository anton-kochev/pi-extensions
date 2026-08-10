# Plan: Direct Guild handover with main-agent awareness

## Goal
Allow the user to delegate a task directly to a Guild member from the Pi TUI without asking the main agent to call `guild_handover`. Run the handover synchronously, preserve its lifecycle in the transcript, and make the started and terminal events available to the main agent on its next turn without automatically triggering a response.

## Context (from the codebase)
- `pithos.guild/src/guild.ts` currently registers the agent-callable `guild_handover` tool and the roster-only `/guild` command. Tool preparation, project-override approval, active-run visibility, child execution, and result construction currently live in the tool handler.
- `pithos.guild/src/runner.ts` already runs an isolated child Pi process, inherits the active model/thinking level/cwd/trust decision, enforces member tool boundaries, streams updates, and supports cancellation through an `AbortSignal`.
- `pithos.guild/src/visibility.ts` and `pithos.guild/src/ui.ts` provide the active-only `guild-dashboard` and the existing Guild call/result presentation.
- Pi extension commands can execute while the main agent is streaming. `ExtensionCommandContext.waitForIdle()` is therefore required before direct execution to prevent the main agent and a write-enabled Guild member from editing concurrently.
- `BorderedLoader` is Pi's established cancellable TUI component and exposes the signal needed by `runGuildMember()`.
- `pi.sendMessage()` persists a custom message without triggering a turn when `triggerTurn` is false. Pi converts that custom message to a user-role message for later model context, so lifecycle content must identify itself as an extension event and frame generated member output as report data rather than new instructions.
- `pi.registerMessageRenderer()` can give these lifecycle messages a Guild-specific transcript presentation.
- Project member overrides are loaded only for trusted projects and already require explicit interactive approval before execution.
- Guild tests use Node's built-in test runner through `npm test`; strict TypeScript verification uses `npm run typecheck`.
- The extension previously required a fresh Pi process for reliable manual verification after source changes.

## Approach
Keep `/guild` as the roster command and add a dedicated `/guild-handover` command with member-name argument completion:

```text
/guild-handover
/guild-handover csharp-coder
/guild-handover csharp-coder Implement validation and run the tests
```

The command will be TUI-only in this iteration:
- With no arguments, discover the effective roster and let the user select a member.
- With a member but no task, open a multiline task editor.
- With a member and task, execute the task directly.
- Empty tasks, unknown members, selection cancellation, and editor cancellation stop before a run is started.

Refactor the current tool path into shared preparation and execution operations used by both adapters:
1. Validate and normalize the task.
2. Discover and select the effective member.
3. Apply project-override approval.
4. Capture model, thinking level, cwd, trust, warnings, permissions, and start time.
5. Register the run with the active-only tracker.
6. Invoke the existing child runner with cancellation and progress callbacks.
7. Validate failure and empty-output conditions and build normalized result details.
8. Always remove the run from the dashboard in `finally`.

The agent-facing tool will retain its existing schema, rendering, streaming updates, error signaling, and transcript behavior. The direct command will adapt the same shared execution through a cancellable `BorderedLoader`.

After approval and immediately before child execution, the direct command will send a visible `started` custom message with an opaque run ID, user initiator, member identity/source, task, permissions, model, and thinking level. It will use `triggerTurn: false`.

When execution ends, the command will send exactly one correlated terminal message:
- `completed` with the bounded member report and run metadata;
- `failed` with diagnostics; or
- `cancelled` when the loader signal aborts a run that already started.

Terminal message content sent to the model will clearly delimit the member report and state that it is task output/evidence rather than instructions. Full structured details will remain available to the custom renderer. The messages will not wake the main agent; both lifecycle events become available naturally on its next turn.

Add a custom Guild lifecycle renderer that distinguishes started, completed, failed, and cancelled events, reuses the existing result visual language, supports transcript expansion, and does not create a persistent live-history panel. The existing `guild-dashboard` remains the only authoritative live state and clears when the synchronous run stops.

### Alternatives considered
- **Transcript-only `appendEntry()` history:** rejected because the confirmed requirement is for the main agent to receive lifecycle and result context on its next turn.
- **Automatically trigger the main agent when the run finishes:** rejected because it adds an unsolicited model turn and undermines direct delegation.
- **Background execution:** rejected for this iteration because it permits concurrent main-agent and coder edits and would require persistent controllers, cancellation commands, shutdown coordination, and overlap policy.
- **Overload `/guild` for execution:** rejected to keep roster inspection and task execution unambiguous.
- **Ask the main agent to invoke `guild_handover`:** rejected because that consumes a main-agent turn and is not direct delegation.
- **Invoke the registered tool definition manually:** rejected because it bypasses Pi's normal tool lifecycle and rendering responsibilities; both adapters should call shared application logic instead.
- **RPC/JSON/print support:** deferred so the initial behavior has one interaction, cancellation, and transcript model.
- **Keyboard shortcut:** deferred until the command workflow is established.

## Steps
1. Write a failing extension test that specifies `/guild-handover` registration, preserves `/guild`, and exposes member-name argument completions; run it and confirm the expected red result.
2. Implement the minimum command registration and argument parsing needed to pass, then refactor parsing names and errors while green.
3. Add failing tests for the no-argument picker, member-only task editor, inline member/task form, empty input, unknown member, and pre-run cancellation; implement each behavior through small red-green-refactor cycles.
4. Add a failing test that proves a direct handover waits for the main agent to become idle and reuses the same model, thinking level, cwd, trust decision, member policy, project approval, progress tracking, output validation, and dashboard cleanup as the tool path.
5. Refactor Guild preparation/execution into a shared workflow and make both the existing tool and the new command pass through it without changing the public `guild_handover` API.
6. Add failing tests for the direct command's cancellable loader and started-run abort behavior; connect the loader signal to the existing child runner and distinguish cancellation from ordinary failure.
7. Add failing tests for structured `started`, `completed`, `failed`, and `cancelled` lifecycle messages, including a shared run ID, explicit user initiation, safe report framing, `triggerTurn: false`, and exactly one terminal event.
8. Register the lifecycle message type and implement its context content and structured details with model-visible output capped at the existing 50 KB boundary.
9. Add failing UI tests for compact and expanded rendering of all lifecycle states, then implement the custom message renderer using the existing Guild theme and result-card conventions.
10. Add regression tests proving the agent-callable tool still streams partial updates, signals child/model failures by throwing, retains project-override approval, and leaves only tool results—not completed runs—in the active dashboard.
11. Update Guild documentation with command syntax, interactive flow, cancellation, synchronous behavior, lifecycle context semantics, safety framing, and the distinction between `/guild`, `/guild-handover`, and `guild_handover`.
12. Run the full automated verification suite, package dry-run, whitespace checks, and manual fresh-process TUI scenarios.

## Files to change
- `pithos.guild/src/guild.ts` — register `/guild-handover`, add completions and TUI flow, share preparation/execution between command and tool, emit lifecycle messages, and coordinate cancellation/visibility.
- `pithos.guild/src/ui.ts` — render started, completed, failed, and cancelled lifecycle messages consistently with existing Guild cards.
- `pithos.guild/test/extension.test.ts` — cover command forms, idle waiting, shared execution behavior, approval, cancellation, lifecycle context, failures, and regressions.
- `pithos.guild/test/ui.test.ts` — cover lifecycle message presentation and expansion.
- `pithos.guild/README.md` — document direct delegation and main-agent awareness.
- `PLAN.md` — keep this plan aligned with implementation if non-material mechanics change.

A separate source/test module may be extracted for command parsing or lifecycle types if a red-green-refactor cycle shows that `guild.ts` is becoming difficult to test or understand; that mechanical extraction does not change the approved behavior.

## Testing & verification
Follow strict red-green-refactor cycles, running the focused test after every red and green step before the full suite.

Automated verification from `pithos.guild/`:

```bash
npm test
npm run typecheck
npm pack --dry-run
```

Repository checks:

```bash
git diff --check
```

Manual verification in a fresh Pi process:
- `/guild` still lists effective members and sources.
- `/guild-handover` opens member selection and then the task editor.
- `/guild-handover csharp-coder` opens only the task editor.
- `/guild-handover csharp-coder <task>` runs without picker/editor prompts.
- A project override still requires explicit approval before a started event is emitted.
- The main agent is allowed to settle before a direct run begins.
- The dashboard and footer show only the active run and clear immediately afterward.
- Escape aborts an executing child and records a correlated cancelled event.
- Success and failure each record exactly one correlated terminal event.
- No automatic main-agent response occurs after any terminal state.
- On the next user turn, the main agent can identify the user-initiated handover and use its safely framed result without the user copying it again.
- The existing agent-callable `guild_handover` behavior and tool-result cards remain unchanged.

## Out of scope
- Concurrent/background direct handovers.
- Main-agent and Guild-member coordination during simultaneous execution.
- Automatic main-agent turns on start or completion.
- A `/guild-cancel` command or persistent background-run controller registry.
- RPC, JSON, or print-mode direct delegation.
- Keyboard shortcuts.
- Multiple members, chains, reviewer workflows, or persistent member memory.
- Legacy aliases or changes to member names/tool boundaries.
- Package version bumps, publishing, or unrelated usage-accounting changes.

## Open assumptions
- `/guild-handover` is the approved command name and `/guild` remains roster-only.
- Lifecycle messages are visible in the transcript as well as available to the next main-agent turn.
- A `started` event is emitted only after validation and project approval, immediately before the child run starts.
- Cancelling member selection or task editing creates no lifecycle history; cancelling after execution starts creates a terminal `cancelled` event.
- Lifecycle events are immutable historical records correlated by run ID; the active dashboard, not the started message, represents current state.
- Generated Guild output is bounded and explicitly framed as report data, but it still enters model context as a Pi custom message represented at the user role.
- Direct execution remains synchronous and blocks further interactive input until completion or cancellation.
