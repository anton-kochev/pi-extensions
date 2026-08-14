# @pithos-kit/atlas

[![npm version](https://img.shields.io/npm/v/@pithos-kit/atlas)](https://www.npmjs.com/package/@pithos-kit/atlas)

Atlas provides confirmed Conventional Commits alongside its interactive catalog, version checker, compatibility doctor, and `.pithos` configuration manager for pithos-kit. It combines a bundled offline catalog with explicit public npm registry checks and Pi runtime provenance.

## Install

```bash
pi install npm:@pithos-kit/atlas
```

Pin an exact version:

```bash
pi install npm:@pithos-kit/atlas@0.3.0
```

For local development:

```bash
pi install -l ./pithos.atlas
```

## Pithos `.pithos` config

```yaml
pi:
  extensions:
    "@pithos-kit/atlas": "npm:0.3.0"
```

The separate Pithos base image can preinstall Atlas so it remains available to diagnose a project configuration that would otherwise prevent project packages from loading.

## Commands

```text
/commit [instructions]
/commit --help
/skill:conventional-commit [instructions]
/skill:conventional-commit --help
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
- `/pithos` opens a focused About, Doctor, and Configure menu in TUI mode and prints help in non-interactive modes.
- `/pithos help` is the single Atlas help page. Detailed package-command help remains with each package through its own `--help` or `-h`.
- `packages` lists package-owned commands, tools, prompts, skills, themes, agents, and configuration from the bundled catalog, then adds runtime command/tool provenance without contacting npm.
- `versions` explicitly queries public npm registry endpoints, distinguishing bundled and latest versions.
- `doctor` distinguishes the active Pi process, the Pi version configured for a future Pithos rebuild, configured package pins, runtime-detected packages, bundled versions, latest versions, and versions compatible with the configured Pi.
- `config validate` reads and validates `.pithos` without changing it.
- `config` opens the interactive manager described below.

## Confirmed commits

`/commit` uses existing staged changes when present. Otherwise it narrows the staging set from explicit instructions, named paths or packages, and the active task context. Ambiguous scopes require confirmation before staging, and unrelated untracked, generated, editor, session, and local-configuration files are excluded unless explicitly requested.

The final message and staged file set are shown by Atlas's controlled `create_commit` tool. Declining leaves the index intact, missing UI fails closed, and a changed staged snapshot invalidates the approval. Atlas blocks direct model-issued `git commit` shell commands so the workflow cannot skip the dialog; normal Git hooks still run. `/commit` is unavailable while enforced Plan mode is active or indeterminate.

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
2. refuses to run while pithos-kit Plan mode is active or indeterminate;
3. reads only `<cwd>/.pithos` and rejects links, special files, aliases, duplicate keys, malformed managed nodes, and oversized input;
4. stages exact Pi and npm versions in memory;
5. shows a contextual diff;
6. asks with `No` before `Yes`;
7. rechecks trust, idle/Plan state, file type, and original bytes inside Pi's per-file mutation queue;
8. writes and synchronizes a same-directory temporary file before atomically replacing the target.

Cancellation and pre-commit errors leave `.pithos` unchanged. After a successful write, rebuild/restart Pithos before expecting the selected Pi or package versions to be active.

## Agent tool

Atlas registers the controlled `create_commit` tool and the read-only `pithos_info` tool. `pithos_info` supports these actions:

- `catalog`
- `versions`
- `runtime`
- `config`
- `doctor`

The `catalog`, `versions`, and `runtime` actions accept an optional `package` filter. Registry-backed `versions` and `doctor` calls also accept `refresh: true` to bypass successful session caches.

The tool has no write, apply, update, install, or rebuild action. Only a user-confirmed `/pithos config` TUI transaction can modify `.pithos`.

## Registry and offline behavior

Registry access is explicit: Atlas performs no network request during extension startup, command completion, `/pithos help`, or `/pithos packages`. Version, doctor, and configuration actions may query `https://registry.npmjs.org` with fixed-origin requests, short timeouts, cancellation, bounded responses, validated metadata, and successful-result session caching.

Set any of the following to disable registry requests:

```bash
PI_OFFLINE=1 pi
PI_OFFLINE=true pi
PI_OFFLINE=yes pi
```

When offline, timed out, unpublished, or otherwise unavailable, Atlas uses its generated bundled catalog and clearly reports that latest registry data is unavailable. The interactive manager can still select bundled exact versions; registry-only versions are unavailable until a successful explicit check.

## Development

Atlas targets Pi `0.83.0` APIs so it works with this repository's current `.pithos` pin. Context Bar still honestly reports its separate Pi `>=0.84.1` requirement.

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
