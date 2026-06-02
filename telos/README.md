# telos

Repo-scoped structured task tracking for pi.

Telos adds a `/tasks` command and an agent-callable `telos_tasks` tool. Tasks persist in the current repository's `TASKS.md`, so they survive pi sessions and remain inspectable outside pi.

## Install

```bash
pi install npm:@anton-kochev/telos
```

Pin to a version:

```bash
pi install npm:@anton-kochev/telos@<version>
```

For local development from a checkout of [`pi-extensions`](https://github.com/anton-kochev/pi-extensions):

```bash
pi install ./telos
pi install ./telos -l   # project-local
```

Temporary test run:

```bash
pi -e ./telos
```

## Usage

Inside pi:

```text
/tasks
/tasks list [--archived|--all]
/tasks create [--priority low|medium|high|urgent] [--status todo|in_progress|blocked|done|archived] [--notes <notes>] <title>
/tasks show <id>
/tasks update <id> [--title <title>] [--priority low|medium|high|urgent] [--status todo|in_progress|blocked|done|archived] [--notes <notes>]
/tasks status <id> <todo|in_progress|blocked|done|archived>
/tasks complete <id>
/tasks reopen <id>
/tasks block <id>
/tasks archive <id>
/tasks delete <id>       # rejected; use archive instead
/tasks --help
```

Examples:

```text
/tasks create --priority high "Implement Telos MVP"
/tasks list --all
/tasks update TSK-0001 --notes "Waiting on review"
/tasks complete TSK-0001
/tasks archive TSK-0001
```

`/tasks` with no arguments opens a read-only interactive task list when pi has an interactive UI. Press `Esc`, `Ctrl+C`, or `q` to exit without modifying tasks. In non-interactive modes it prints the active task list as text.

## Agent tool

Telos registers one LLM-callable tool: `telos_tasks`.

The tool supports the same task operations as `/tasks`: create, list, show, update, status, complete, reopen, block, archive, and delete rejection. It is described neutrally so the agent can use it when the user asks to manage or track tasks; Telos does not add any automatic per-turn task creation or tracking hook.

## `TASKS.md` artifact

Telos stores canonical task data in YAML frontmatter at the repository root:

```md
---
telos_version: 1
tasks:
  - id: TSK-0001
    title: Implement Telos MVP
    status: todo
    priority: high
    notes: ""
    created: "2026-06-02T12:00:00.000Z"
    updated: "2026-06-02T12:00:00.000Z"
---

# Tasks

Generated human-readable summary...
```

The YAML frontmatter is the source of truth. The Markdown body is regenerated after successful Telos mutations and should be treated as display output.

Task fields:

- `id` — stable task ID, generated as `TSK-0001`, `TSK-0002`, ...
- `title` — non-empty task title
- `status` — `todo`, `in_progress`, `blocked`, `done`, or `archived`
- `priority` — `low`, `medium`, `high`, or `urgent`
- `notes` — string, may be empty
- `created` — ISO 8601 timestamp
- `updated` — ISO 8601 timestamp

Archive is the MVP soft-delete mechanism. Physical deletion is rejected and leaves `TASKS.md` unchanged.

## Local development

```bash
cd telos
npm install
npm test
```

Telos uses Node's built-in `node:test` runner with `tsx` for TypeScript tests.

## Publish

This package is intended to publish through the repository's trusted publishing workflow. Release with a package-specific tag:

```bash
cd telos
npm version patch --tag-version-prefix="telos-v"
git push --follow-tags
```

## Notes

This package imports pi runtime packages as peer dependencies:

- `@earendil-works/pi-ai`
- `@earendil-works/pi-coding-agent`
- `@earendil-works/pi-tui`
- `typebox`

Do not bundle those dependencies; pi provides them at runtime.
