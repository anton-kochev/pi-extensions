# pithos-kit

A monorepo of independently published Pi extensions, skills, prompts, themes, and package tooling for Pithos.

## Packages

- [`pithos.squiggle/`](./pithos.squiggle) — quietly polish grammar and spelling in user prompts. [![npm version](https://img.shields.io/npm/v/@pithos-kit/squiggle.svg)](https://www.npmjs.com/package/@pithos-kit/squiggle)
- [`pithos.echo/`](./pithos.echo) — read-only side-channel question asker for Pi sessions and project code. [![npm version](https://img.shields.io/npm/v/@pithos-kit/echo.svg)](https://www.npmjs.com/package/@pithos-kit/echo)
- [`pithos.answer/`](./pithos.answer) — extract questions from the last assistant response, answer them in an interactive TUI, and submit the answers. [![npm version](https://img.shields.io/npm/v/@pithos-kit/answer.svg)](https://www.npmjs.com/package/@pithos-kit/answer)
- [`pithos.telos/`](./pithos.telos) — repo-scoped structured task tracking through `/tasks`, an agent tool, and `.pi/telos-tasks.md`. [![npm version](https://img.shields.io/npm/v/@pithos-kit/telos.svg)](https://www.npmjs.com/package/@pithos-kit/telos)
- [`pithos.aegis/`](./pithos.aegis) — protect Pi agent shell commands and file mutations with configurable rules. [![npm version](https://img.shields.io/npm/v/@pithos-kit/aegis.svg)](https://www.npmjs.com/package/@pithos-kit/aegis)
- [`pithos.guild/`](./pithos.guild) — isolated .NET and Angular architecture and implementation Guild members. [![npm version](https://img.shields.io/npm/v/@pithos-kit/guild.svg)](https://www.npmjs.com/package/@pithos-kit/guild)
- [`pithos.context-bar/`](./pithos.context-bar) — a thin, stacked context-window composition bar above the editor. [![npm version](https://img.shields.io/npm/v/@pithos-kit/context-bar.svg)](https://www.npmjs.com/package/@pithos-kit/context-bar)
- [`pithos.skills/`](./pithos.skills) — enforced Plan mode, `/commit`, `/srs`, a theme, and TDD guidance. [![npm version](https://img.shields.io/npm/v/@pithos-kit/skills.svg)](https://www.npmjs.com/package/@pithos-kit/skills)
- [`pithos.themes/`](./pithos.themes) — accessible Auric light and dark themes with automatic appearance switching. [![npm version](https://img.shields.io/npm/v/@pithos-kit/themes.svg)](https://www.npmjs.com/package/@pithos-kit/themes)
- [`pithos.atlas/`](./pithos.atlas) — name eligible new sessions after their first user message, create confirmed commits, explore package capabilities, diagnose compatibility, and manage `.pithos` interactively. [![npm version](https://img.shields.io/npm/v/@pithos-kit/atlas.svg)](https://www.npmjs.com/package/@pithos-kit/atlas)

## Install

Install one package:

```bash
pi install npm:@pithos-kit/atlas
pi install npm:@pithos-kit/squiggle
pi install npm:@pithos-kit/echo
pi install npm:@pithos-kit/answer
pi install npm:@pithos-kit/telos
pi install npm:@pithos-kit/aegis
pi install npm:@pithos-kit/guild
pi install npm:@pithos-kit/context-bar
pi install npm:@pithos-kit/skills
pi install npm:@pithos-kit/themes
```

Pin an exact version when reproducibility matters:

```bash
pi install npm:@pithos-kit/squiggle@0.4.1
```

In `.pithos`, Pi packages live under `pi.extensions`:

```yaml
pi:
  version: "0.83.0"
  extensions:
    "@pithos-kit/atlas": "npm:0.3.0"
    "@pithos-kit/squiggle": "npm:0.4.1"
```

Atlas can validate and interactively manage toolchain versions, `pi.version`, and `@pithos-kit/*` entries while preserving third-party configuration. Its changes describe a future rebuilt Pithos environment; they do not replace the active Pi process. Run `/pithos help` after installing it.

Current package metadata declares Pi `>=0.83.0` except Context Bar and Themes, which require Pi `>=0.84.1`. Atlas reports incompatible combinations rather than silently accepting them.

## Package-local help

Atlas documents its own command with `/pithos help`. Every other public package command documents itself with `--help` or `-h`, for example:

```text
/ask --help
/tasks --help
/guild-handover --help
/plan --help
```

## Local development

From a checkout of this repository:

```bash
pi install -l ./pithos.squiggle
pi install -l ./pithos.echo
pi install -l ./pithos.answer
pi install -l ./pithos.telos
pi install -l ./pithos.aegis
pi install -l ./pithos.guild
pi install -l ./pithos.context-bar
pi install -l ./pithos.skills
pi install -l ./pithos.themes
pi install -l ./pithos.atlas
```

Each dotted subdirectory has its own `package.json` and is published as a standalone npm package with a short name under `@pithos-kit`.

## Local Pi patches

Repo-local helper scripts for local Pi install patches live in [`scripts/pi-patches/`](./scripts/pi-patches). These changes survive restarts but may be overwritten by a Pi package update.

```bash
scripts/pi-patches/suppress-prompt-template-display.mjs
```

## Release

Packages release independently using the `pithos-kit.<name>-v` tag namespace:

```bash
cd pithos.squiggle
npm version patch --tag-version-prefix="pithos-kit.squiggle-v"
git push --follow-tags
```

| Package directory | npm package | Tag prefix | Workflow |
|---|---|---|---|
| `pithos.squiggle` | `@pithos-kit/squiggle` | `pithos-kit.squiggle-v` | `publish-pithos.squiggle.yml` |
| `pithos.echo` | `@pithos-kit/echo` | `pithos-kit.echo-v` | `publish-pithos.echo.yml` |
| `pithos.answer` | `@pithos-kit/answer` | `pithos-kit.answer-v` | `publish-pithos.answer.yml` |
| `pithos.telos` | `@pithos-kit/telos` | `pithos-kit.telos-v` | `publish-pithos.telos.yml` |
| `pithos.aegis` | `@pithos-kit/aegis` | `pithos-kit.aegis-v` | `publish-pithos.aegis.yml` |
| `pithos.guild` | `@pithos-kit/guild` | `pithos-kit.guild-v` | `publish-pithos.guild.yml` |
| `pithos.context-bar` | `@pithos-kit/context-bar` | `pithos-kit.context-bar-v` | `publish-pithos.context-bar.yml` |
| `pithos.skills` | `@pithos-kit/skills` | `pithos-kit.skills-v` | `publish-pithos.skills.yml` |
| `pithos.themes` | `@pithos-kit/themes` | `pithos-kit.themes-v` | `publish-pithos.themes.yml` |
| `pithos.atlas` | `@pithos-kit/atlas` | `pithos-kit.atlas-v` | `publish-pithos.atlas.yml` |

The workflows publish through npm trusted publishing and OIDC. Complete the external organization, publisher, Pithos-base, and deprecation steps in [`CUTOVER.md`](./CUTOVER.md) before releasing.
