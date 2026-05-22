# pi-extensions

A monorepo for personal pi extensions, each published independently to npm.

## Extensions

- [`squiggle/`](./squiggle) — quietly polish grammar and spelling in user prompts. [![npm version](https://img.shields.io/npm/v/@anton-kochev/squiggle.svg)](https://www.npmjs.com/package/@anton-kochev/squiggle)
- [`echo/`](./echo) — read-only side-channel question asker for pi sessions and project code. [![npm version](https://img.shields.io/npm/v/@anton-kochev/echo.svg)](https://www.npmjs.com/package/@anton-kochev/echo)

## Install

```bash
pi install npm:@anton-kochev/squiggle
pi install npm:@anton-kochev/echo
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
```

Each subdirectory has its own `package.json` and is published as a standalone npm package.

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

Trusted publishing handles the rest — the workflows at `.github/workflows/publish-squiggle.yml` and `.github/workflows/publish-echo.yml` fire on their respective tag prefixes and publish to npm via OIDC.
