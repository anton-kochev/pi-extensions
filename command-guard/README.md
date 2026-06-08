# command-guard

Guard Pi agent shell commands and file mutations with configurable block and confirmation rules.

`command-guard` intercepts agent `bash`, `write`, and `edit` tool calls before they run. It has no blacklisted commands by default, and one built-in protected path: editing `.pi/command-guard.json` requires confirmation. Add more project rules in `.pi/command-guard.json`. For confirmation rules, **No** is the first/default option. Any result other than selecting `Yes` blocks the operation.

User-entered `!` and `!!` shell commands are not guarded because those commands are already explicit user intent.

## Install

```bash
pi install npm:@anton-kochev/command-guard
```

Pin to a version:

```bash
pi install npm:@anton-kochev/command-guard@<version>
```

For local development from a checkout of [`pi-extensions`](https://github.com/anton-kochev/pi-extensions):

```bash
pi install ./command-guard
```

Project-local install:

```bash
pi install ./command-guard -l
```

Temporary test run:

```bash
pi -e ./command-guard
```

## Pithos `.pithos` config

```yaml
pi:
  extensions:
    "@anton-kochev/command-guard": "npm:0.1.0"
```

## Default behavior

There are no built-in command blacklist rules. The only built-in protection rule requires confirmation before an agent `write` or `edit` operation changes `.pi/command-guard.json`.

When an agent operation matches a configured `confirm` rule, `command-guard` shows an interactive prompt with these options:

```text
No
Yes
```

The operation is allowed only when `Yes` is selected. `No`, Escape/cancel, or non-interactive modes block the operation.

## Configuration

Create `.pi/command-guard.json` in your project to add more rules:

```json
{
  "commands": [
    {
      "name": "git push",
      "pattern": "\\bgit\\s+push\\b",
      "action": "confirm"
    },
    {
      "name": "recursive remove",
      "pattern": "\\brm\\s+(-rf|-fr|--recursive)\\b",
      "action": "block"
    }
  ],
  "paths": [
    {
      "name": "protect .pi",
      "pattern": "(^|/)\\.pi(/|$)",
      "action": "confirm"
    }
  ]
}
```

Top-level fields:

- `commands`: rules matched against the full agent-run shell command for `bash` tool calls.
- `paths`: rules matched against normalized project-relative paths for `write` and `edit` tool calls.
- `rules`: backward-compatible alias for command rules.

Rule fields:

- `name`: human-readable rule name shown in prompts and status output.
- `pattern`: JavaScript regular expression string matched case-insensitively.
  - Command patterns match the full shell command.
  - Path patterns match normalized project-relative paths like `.pi/settings.json`.
- `action`: either:
  - `confirm` — ask the user before allowing the operation; block when no UI is available.
  - `block` — always block the operation.

If multiple rules match, `block` takes precedence over `confirm`.

Invalid project config does not break the extension. It reports warnings and continues with any valid rules.

## Commands

Inside pi:

```text
/command-guard status
/command-guard list
/command-guard reload
/command-guard toggle
/command-guard help
```

- `status` — show config path, whether config was found, and rule count.
- `list` — show effective rules.
- `reload` — reload `.pi/command-guard.json` from disk.
- `toggle` — enable/disable command-guard for the current Pi session. The toggle state survives `/reload`.
- `help` — show usage and a copy-paste example config.

`/command-guard` with no argument is the same as `/command-guard status`.

## Notes

This package imports pi runtime packages as peer dependencies:

- `@earendil-works/pi-coding-agent`

Do not bundle those dependencies; pi provides them at runtime.
