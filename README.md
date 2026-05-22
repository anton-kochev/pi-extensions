# pi-extensions

Pi extensions for personal use, installed as a single pi-package from this repository.

## Install via pithos

In your project's `.pithos`:

```yaml
pi:
  extensions:
    squiggle: "git:https://github.com/anton-kochev/pi-extensions.git#main"
```

Pithos's entrypoint passes this to `pi install`, which clones the repo, runs `npm install`, and registers the extensions declared in the root `pi.extensions` manifest.

## Install directly with pi

```bash
pi install git:github.com/anton-kochev/pi-extensions
```

Pin to a tag for reproducibility:

```bash
pi install git:github.com/anton-kochev/pi-extensions@v0.1.0
```

## Extensions in this repo

- [`squiggle/`](./squiggle) — quietly polish grammar and spelling in user prompts.

## Local development

From a checkout of this repo:

```bash
pi install -l ./squiggle
```

Each subdirectory has its own `package.json` so individual extensions remain installable in isolation.
