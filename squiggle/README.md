# squiggle

Quietly polish grammar and spelling in your pi prompts.

The extension intercepts user input, shows a `squiggling...` spinner while processing, corrects spelling and grammar using a configured model, shows a colored diff, and submits the corrected prompt automatically without confirmation. Named after the red squiggle from your favorite spell-checker.

## Install

This extension ships as part of the [`pi-extensions`](https://github.com/anton-kochev/pi-extensions) repository. The simplest install path is via the root pi-package — see the [repo README](../README.md).

For local development from a checkout of `pi-extensions`:

```bash
pi install ./squiggle
```

Project-local install:

```bash
pi install ./squiggle -l
```

Temporary test run:

```bash
pi -e ./squiggle
```

## Pithos `.pithos` config

```yaml
pi:
  extensions:
    squiggle: "git:https://github.com/anton-kochev/pi-extensions.git#main"
```

Pin to a tag for reproducibility:

```yaml
pi:
  extensions:
    squiggle: "git:https://github.com/anton-kochev/pi-extensions.git#v0.1.0"
```

## Configuration

Create `.pi/squiggle.json` in your project:

```json
{
  "mode": "on",
  "model": "openai-codex/gpt-5.4-mini",
  "maxInputChars": 500
}
```

Options:

- `mode`: `"on"` or `"off"`
- `model`: pi model spec in `provider/model` format
- `maxInputChars`: maximum input length to send to the correction model

Environment variables override the config file:

```bash
SQUIGGLE_MODE=off pi
SQUIGGLE_MODEL=openai-codex/gpt-5.4-mini pi
SQUIGGLE_MAX_CHARS=1000 pi
```

## Status

Inside pi:

```text
/squiggle-status
```

## Notes

This package imports pi runtime packages as peer dependencies:

- `@earendil-works/pi-ai`
- `@earendil-works/pi-coding-agent`

Do not bundle those dependencies; pi provides them at runtime.
