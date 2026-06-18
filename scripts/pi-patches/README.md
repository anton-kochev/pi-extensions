# Pi patch scripts

Small, idempotent local patch scripts for changes that should survive restarts but may be overwritten by a Pi package update.

Run these after updating or reinstalling Pi.

## Suppress prompt-template display

Shows the original slash-command invocation (for example `/plan ...`) in the chat while still sending the expanded prompt template to the model.

```bash
scripts/pi-patches/suppress-prompt-template-display.mjs
```

Check whether the patch is already applied:

```bash
scripts/pi-patches/suppress-prompt-template-display.mjs --check
```

By default the script patches:

```text
/opt/pi-npm/lib/node_modules/@earendil-works/pi-coding-agent
```

Override the Pi package location with either:

```bash
PI_CODING_AGENT_DIR=/path/to/@earendil-works/pi-coding-agent scripts/pi-patches/suppress-prompt-template-display.mjs
```

or:

```bash
scripts/pi-patches/suppress-prompt-template-display.mjs /path/to/@earendil-works/pi-coding-agent
```
