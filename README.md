# pithos-kit

A monorepo of independently published Pi extensions, skills, prompts, and themes for Pithos.

## Packages

- [`pithos.squiggle/`](./pithos.squiggle) — quietly polish grammar and spelling in user prompts. [![npm version](https://img.shields.io/npm/v/@anton-kochev/pithos.squiggle.svg)](https://www.npmjs.com/package/@anton-kochev/pithos.squiggle)
- [`pithos.echo/`](./pithos.echo) — read-only side-channel question asker for Pi sessions and project code. [![npm version](https://img.shields.io/npm/v/@anton-kochev/pithos.echo.svg)](https://www.npmjs.com/package/@anton-kochev/pithos.echo)
- [`pithos.answer/`](./pithos.answer) — extract questions from the last assistant response, answer them in an interactive TUI, and submit the answers. [![npm version](https://img.shields.io/npm/v/@anton-kochev/pithos.answer.svg)](https://www.npmjs.com/package/@anton-kochev/pithos.answer)
- [`pithos.telos/`](./pithos.telos) — repo-scoped structured task tracking through `/tasks`, an agent tool, and `.pi/telos-tasks.md`. [![npm version](https://img.shields.io/npm/v/@anton-kochev/pithos.telos.svg)](https://www.npmjs.com/package/@anton-kochev/pithos.telos)
- [`pithos.aegis/`](./pithos.aegis) — protect Pi agent shell commands and file mutations with configurable rules. [![npm version](https://img.shields.io/npm/v/@anton-kochev/pithos.aegis.svg)](https://www.npmjs.com/package/@anton-kochev/pithos.aegis)
- [`pithos.guild/`](./pithos.guild) — isolated .NET and Angular architecture and implementation Guild members. [![npm version](https://img.shields.io/npm/v/@anton-kochev/pithos.guild.svg)](https://www.npmjs.com/package/@anton-kochev/pithos.guild)
- [`pithos.context-bar/`](./pithos.context-bar) — a thin, stacked context-window composition bar above the editor. [![npm version](https://img.shields.io/npm/v/@anton-kochev/pithos.context-bar.svg)](https://www.npmjs.com/package/@anton-kochev/pithos.context-bar)
- [`pithos.skills/`](./pithos.skills) — Pi skills and prompt commands, including an enforced read-only `/plan` workflow, `/commit`, `/srs`, and TDD guidance. [![npm version](https://img.shields.io/npm/v/@anton-kochev/pithos.skills.svg)](https://www.npmjs.com/package/@anton-kochev/pithos.skills)

## Install

```bash
pi install npm:@anton-kochev/pithos.squiggle
pi install npm:@anton-kochev/pithos.echo
pi install npm:@anton-kochev/pithos.answer
pi install npm:@anton-kochev/pithos.telos
pi install npm:@anton-kochev/pithos.aegis
pi install npm:@anton-kochev/pithos.guild
pi install npm:@anton-kochev/pithos.context-bar
pi install npm:@anton-kochev/pithos.skills
```

Pin to a specific version:

```bash
pi install npm:@anton-kochev/pithos.squiggle@<version>
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
```

Each dotted subdirectory has its own `package.json` and is published as a standalone npm package.

## Local Pi patches

Repo-local helper scripts for local Pi install patches live in [`scripts/pi-patches/`](./scripts/pi-patches). These changes survive restarts but may be overwritten by a Pi package update. Run them after updating or reinstalling Pi.

```bash
scripts/pi-patches/suppress-prompt-template-display.mjs
```

## Release

Each package releases independently. From its directory, use the matching dotted tag prefix:

```bash
cd pithos.squiggle
npm version patch --tag-version-prefix="pithos.squiggle-v" # or minor/major
git push --follow-tags
```

| Package directory | Tag prefix | Workflow |
|---|---|---|
| `pithos.squiggle` | `pithos.squiggle-v` | `publish-pithos.squiggle.yml` |
| `pithos.echo` | `pithos.echo-v` | `publish-pithos.echo.yml` |
| `pithos.answer` | `pithos.answer-v` | `publish-pithos.answer.yml` |
| `pithos.telos` | `pithos.telos-v` | `publish-pithos.telos.yml` |
| `pithos.aegis` | `pithos.aegis-v` | `publish-pithos.aegis.yml` |
| `pithos.guild` | `pithos.guild-v` | `publish-pithos.guild.yml` |
| `pithos.context-bar` | `pithos.context-bar-v` | `publish-pithos.context-bar.yml` |
| `pithos.skills` | `pithos.skills-v` | `publish-pithos.skills.yml` |

The workflows in [`.github/workflows/`](./.github/workflows) publish to npm through trusted publishing and OIDC. Before the first dotted releases, complete the external steps in [`CUTOVER.md`](./CUTOVER.md).
