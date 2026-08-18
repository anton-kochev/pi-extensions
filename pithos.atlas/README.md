# @pithos-kit/atlas

[![npm version](https://img.shields.io/npm/v/@pithos-kit/atlas)](https://www.npmjs.com/package/@pithos-kit/atlas)

Atlas gives eligible new sessions readable synthetic names, provides confirmed Conventional Commits and test-driven development guidance, and includes an interactive catalog, version checker, compatibility doctor, and `.pithos` configuration manager for pithos-kit. It combines bounded model-assisted session naming and a bundled offline catalog with explicit public npm registry checks and Pi runtime provenance.

## Install

```bash
pi install npm:@pithos-kit/atlas
```

Pin an exact version:

```bash
pi install npm:@pithos-kit/atlas@0.5.0
```

For local development:

```bash
pi install -l ./pithos.atlas
```

## Pithos `.pithos` config

```yaml
pi:
  extensions:
    "@pithos-kit/atlas": "npm:0.5.0"
```

The separate Pithos base image can preinstall Atlas so it remains available to diagnose a project configuration that would otherwise prevent project packages from loading.

## Automatic session names

After the first user message in an eligible new session, Atlas asks the cheapest authenticated, session-scoped, non-reasoning text model for one synthetic name containing 3–5 lowercase ASCII words in kebab-case, inspired by 1980s, 1990s, and 2000s pop culture. For example: `neon-pager-ringtone-reboot`. The static request includes no conversation, prompt, cwd, tools, session identifier, or other session-derived content.

The request runs in the background with thinking disabled by model selection, no prompt caching, no retries, and a ten-second timeout. It may incur a small provider charge; Pi 0.83 does not include this background completion in session usage totals. Invalid output, missing credentials or a suitable model, provider failure, timeout, `PI_OFFLINE`, or session shutdown produces a local three-word kebab-case fallback. A manual or extension-provided rename while generation is pending cancels the attempt and remains authoritative.

Automatic naming eligibility applies to a fresh startup whose allocated session file does not exist yet, `/new`, and unnamed in-process forks. Session startup alone never generates or assigns a name; Atlas waits for the session's first user message. Atlas preserves the intent of names supplied through `--name`, `/name`, inherited by a fork, or set by another extension, while canonicalizing any nonconforming value to lowercase kebab-case. It leaves persisted legacy unnamed sessions and reloads untouched. Because Pi 0.83 does not expose initial CLI-fork provenance, `--fork` from an old unnamed session may remain unnamed.

Pi persists the name as canonical session metadata and displays it in the native footer, terminal title, and session selector. The name remains until changed manually with `/name` or replaced after a successful approved save by [`@pithos-kit/plan`](https://www.npmjs.com/package/@pithos-kit/plan); while Plan mode is active, its minimal replacement footer retains the current name. Ephemeral `--no-session` runs receive a runtime name but cannot persist beyond the process.

Atlas also provides the model-facing `rename_session` tool. Its tool guidance limits use to explicit user requests to name or rename the current session. Lowercase kebab-case is mandatory for every session name: Atlas validates tool input and canonicalizes names set through `/name`, `--name`, inheritance, or other extensions. Values with no ASCII letters or digits become `unnamed-session`.

## Commands

```text
/commit [instructions]
/commit --help
/skill:conventional-commit [instructions]
/skill:conventional-commit --help
/skill:tdd [task context]
/pithos
/pithos help
/pithos packages
/pithos versions [--refresh]
/pithos doctor [--refresh]
/pithos config
/pithos config validate
```

- `/commit` starts Atlas's context-aware Conventional Commit workflow. It can infer a narrow staging set, but creating the commit always requires interactive confirmation.
- `/skill:conventional-commit` exposes the same workflow for explicit or proactive skill loading.
- `/skill:tdd` loads the language-agnostic red-green-refactor workflow for explicit or proactive test-driven development.
- `/pithos` opens a focused About, Doctor, and Configure menu in TUI mode and prints help in non-interactive modes.
- `/pithos help` is the single Atlas help page. `/commit` and `/skill:conventional-commit` retain Atlas-provided help; native `/skill:tdd` passes trailing arguments into the skill as task context.
- `packages` lists package-owned commands, tools, prompts, skills, themes, agents, and configuration from the bundled catalog, then adds runtime command/tool provenance without contacting npm.
- `versions` explicitly queries public npm registry endpoints, distinguishing bundled and latest versions.
- `doctor` distinguishes the active Pi process, the Pi version configured for a future Pithos rebuild, configured package pins, runtime-detected packages, bundled versions, latest versions, and versions compatible with the configured Pi.
- `config validate` reads and validates `.pithos` without changing it.
- `config` opens the interactive manager described below.

## Test-driven development skill

Atlas owns the `tdd` skill previously published by the retired `@pithos-kit/skills` package. The SRS prompt from that package was removed. Remove the retired package at every scope where it was installed, then remove its future-build pin through `/pithos config`:

```bash
pi remove npm:@pithos-kit/skills       # global settings
pi remove -l npm:@pithos-kit/skills    # current project's settings
```

Opening `/pithos config` with a retired Skills pin stages its removal for review; Atlas will not preserve or re-offer that package. Use `pi list` to check both effective package scopes. Remove any earlier legacy Skills identity too if it is still present; loading either historical package beside Atlas can create a duplicate `tdd` skill. TDD remains available through Atlas.

Use Pi's native resource configuration to control whether the agent can discover TDD:

1. Run `pi config` for global settings, or `pi config -l` for a project override.
2. Toggle Atlas's `tdd` skill.
3. Run `/reload` in any active Pi session.

When enabled, Pi includes the TDD description in the agent's available skills. Pi's `enableSkillCommands` setting controls native skill-command registration and autocomplete without hiding loaded skills from the model. Disabling the TDD resource removes its model-visible description and native command after reload. It does not remove full skill instructions already expanded into the current conversation; start a new session or branch from before the invocation when that context must also be absent.

## Confirmed commits

`/commit` uses existing staged changes when present. Otherwise it narrows the staging set from explicit instructions, named paths or packages, and the active task context. Ambiguous scopes require confirmation before staging, and unrelated untracked, generated, editor, session, and local-configuration files are excluded unless explicitly requested.

The final message and staged file set are shown by Atlas's controlled `create_commit` tool. Declining leaves the index intact, missing UI fails closed, and a changed staged snapshot invalidates the approval. Atlas blocks direct model-issued `git commit` shell commands so the workflow cannot skip the dialog; normal Git hooks still run. `/commit` is unavailable while `@pithos-kit/plan` Plan mode is active or indeterminate.

## Interactive configuration

`/pithos config` manages:

```yaml
toolchains:
  dotnet: "<exact-version>"
  go: "<exact-version>"
  rust: "<exact-version>"
pi:
  version: "..."
  extensions:
    "@pithos-kit/...": "npm:<exact-version>"
```

Configure has three steps: select the Pi version, select Pithos toolchains and their exact numeric versions, then select pithos-kit packages. Atlas preserves unknown keys, comments and ordering where YAML document editing permits, and third-party `pi.extensions` entries. It never edits `.pithos.d/`, installs packages, changes the active Pi process, or rebuilds Pithos.

The toolchain and package selectors use `◆` for selected entries, `◇` for available entries, and `◈` for changes staged in the wizard but not yet submitted. The package step presents one alphabetized list using compact version labels; an `↑` between versions means an update is available. Selected-Pi requirements are called out inline. When registry metadata is unavailable, Atlas labels bundled fallback versions explicitly instead of presenting them as latest. Press Escape to cancel any selector.

A configuration transaction:

1. requires a trusted TUI project and waits for the agent to become idle;
2. refuses to run while `@pithos-kit/plan` Plan mode is active or indeterminate;
3. reads only `<cwd>/.pithos` and rejects links, special files, aliases, duplicate keys, malformed managed nodes, and oversized input;
4. stages exact Pi and npm versions in memory;
5. shows a contextual diff;
6. asks with `No` before `Yes`;
7. rechecks trust, idle/Plan state, file type, and original bytes inside Pi's per-file mutation queue;
8. writes and synchronizes a same-directory temporary file before atomically replacing the target.

Cancellation and pre-commit errors leave `.pithos` unchanged. After a successful write, rebuild/restart Pithos before expecting the selected Pi or package versions to be active.

## Agent tools

Atlas registers the controlled `create_commit` tool, the validated `rename_session` tool, and the read-only `pithos_info` tool. `pithos_info` supports these actions:

- `catalog`
- `versions`
- `runtime`
- `config`
- `doctor`

The `catalog`, `versions`, and `runtime` actions accept an optional `package` filter. Registry-backed `versions` and `doctor` calls also accept `refresh: true` to bypass successful session caches.

The tool has no write, apply, update, install, or rebuild action. Only a user-confirmed `/pithos config` TUI transaction can modify `.pithos`.

## Registry and offline behavior

Atlas performs no network request during extension registration, session startup, command completion, `/pithos help`, or `/pithos packages`. Only the first user message in an eligible new unnamed session may start the bounded synthetic-name model request described above. Version, doctor, and configuration actions may query `https://registry.npmjs.org` with fixed-origin requests, short timeouts, cancellation, bounded responses, validated metadata, and successful-result session caching.

Set any of the following to disable registry requests:

```bash
PI_OFFLINE=1 pi
PI_OFFLINE=true pi
PI_OFFLINE=yes pi
```

When offline, session naming uses its local fallback. Registry operations that are timed out, unpublished, or otherwise unavailable use the generated bundled catalog and clearly report that latest registry data is unavailable. The interactive manager can still select bundled exact versions; registry-only versions are unavailable until a successful explicit check.

## Development

Atlas targets Pi `0.83.0` APIs for compatibility while this repository currently pins Pi `0.84.2` in `.pithos`. Context Bar still honestly reports its separate Pi `>=0.84.1` requirement.

```bash
cd pithos.atlas
npm install
npm run catalog:generate
npm test
npm run typecheck
npm pack --dry-run
```

The generated snapshot at `src/generated/catalog.json` is derived from every package's `pithosKit` manifest metadata. Tests fail if it is stale.

Atlas's shipped runtime dependencies pass `npm audit --omit=dev`. The development tree intentionally pins Pi `0.83.0` for compatibility testing, so a full development audit may also report advisories inherited from that older Pi toolchain.
