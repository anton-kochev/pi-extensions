# pi-extensions

[![npm version](https://img.shields.io/npm/v/@anton-kochev/pi-extensions.svg)](https://www.npmjs.com/package/@anton-kochev/pi-extensions)

Pi extensions for personal use.

## Install

```bash
pi install npm:@anton-kochev/pi-extensions
```

Or pin to a specific version:

```bash
pi install npm:@anton-kochev/pi-extensions@<version>
```

## Extensions

- [`squiggle/`](./squiggle) — quietly polish grammar and spelling in user prompts.

## Local development

From a checkout of this repo:

```bash
pi install -l ./squiggle
```

Each subdirectory has its own `package.json` so individual extensions remain installable in isolation.

## Release

```bash
npm version patch       # or minor/major
git push --follow-tags
```

Trusted publishing handles the rest — the workflow at `.github/workflows/publish.yml` fires on tag push and publishes to npm via OIDC.
