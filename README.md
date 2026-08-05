# pi-extensions

A monorepo for personal pi extensions, each published independently to npm.

## Extensions

- [`squiggle/`](./squiggle) — quietly polish grammar and spelling in user prompts. [![npm version](https://img.shields.io/npm/v/@anton-kochev/squiggle.svg)](https://www.npmjs.com/package/@anton-kochev/squiggle)
- [`echo/`](./echo) — read-only side-channel question asker for pi sessions and project code. [![npm version](https://img.shields.io/npm/v/@anton-kochev/echo.svg)](https://www.npmjs.com/package/@anton-kochev/echo)
- [`answer/`](./answer) — extract questions from the last assistant response, answer them in an interactive TUI, and submit the answers. [![npm version](https://img.shields.io/npm/v/@anton-kochev/answer.svg)](https://www.npmjs.com/package/@anton-kochev/answer)
- [`telos/`](./telos) — repo-scoped structured task tracking through `/tasks`, an agent tool, and `TASKS.md`. [![npm version](https://img.shields.io/npm/v/@anton-kochev/telos.svg)](https://www.npmjs.com/package/@anton-kochev/telos)
- [`command-guard/`](./command-guard) — guard Pi agent shell commands and file mutations with configurable rules. [![npm version](https://img.shields.io/npm/v/@anton-kochev/command-guard.svg)](https://www.npmjs.com/package/@anton-kochev/command-guard)
- [`guild/`](./guild) — isolated .NET and Angular architecture and implementation Guild members. [![npm version](https://img.shields.io/npm/v/@anton-kochev/guild.svg)](https://www.npmjs.com/package/@anton-kochev/guild)
- [`pi-skills/`](./pi-skills) — pi skills and prompt commands, including `/plan`, `/commit`, and `/srs`. [![npm version](https://img.shields.io/npm/v/@anton-kochev/pi-skills.svg)](https://www.npmjs.com/package/@anton-kochev/pi-skills)

## Install

```bash
pi install npm:@anton-kochev/squiggle
pi install npm:@anton-kochev/echo
pi install npm:@anton-kochev/answer
pi install npm:@anton-kochev/telos
pi install npm:@anton-kochev/command-guard
pi install npm:@anton-kochev/guild
pi install npm:@anton-kochev/pi-skills
```

Pin to a specific version:

```bash
pi install npm:@anton-kochev/squiggle@<version>
```

## Local development

From a checkout of this repo:

```bash
pi install -l ./squiggle
pi install -l ./echo
pi install -l ./answer
pi install -l ./telos
pi install -l ./command-guard
pi install -l ./guild
pi install -l ./pi-skills
```

Each subdirectory has its own `package.json` and is published as a standalone npm package.

## Local Pi patches

Repo-local helper scripts for local Pi install patches live in [`scripts/pi-patches/`](./scripts/pi-patches).
These are for changes that survive restarts but may be overwritten by a Pi package update.
Run them after updating or reinstalling Pi.

```bash
scripts/pi-patches/suppress-prompt-template-display.mjs
```

## Release

Each extension releases independently via a prefixed tag:

```bash
cd squiggle
npm version patch --tag-version-prefix="squiggle-v"   # or minor/major
git push --follow-tags
```

```bash
cd echo
npm version patch --tag-version-prefix="echo-v"
git push --follow-tags
```

```bash
cd answer
npm version patch --tag-version-prefix="answer-v"
git push --follow-tags
```

```bash
cd telos
npm version patch --tag-version-prefix="telos-v"
git push --follow-tags
```

```bash
cd command-guard
npm version patch --tag-version-prefix="command-guard-v"
git push --follow-tags
```

```bash
cd guild
npm version patch --tag-version-prefix="guild-v"
git push --follow-tags
```

```bash
cd pi-skills
npm version patch --tag-version-prefix="pi-skills-v"
git push --follow-tags
```

Trusted publishing handles the rest — the workflows at `.github/workflows/publish-squiggle.yml`, `.github/workflows/publish-echo.yml`, `.github/workflows/publish-answer.yml`, `.github/workflows/publish-telos.yml`, `.github/workflows/publish-command-guard.yml`, `.github/workflows/publish-guild.yml`, and `.github/workflows/publish-pi-skills.yml` fire on their respective tag prefixes and publish to npm via OIDC.
