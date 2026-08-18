# @pithos-kit/plan

[![npm version](https://img.shields.io/npm/v/@pithos-kit/plan)](https://www.npmjs.com/package/@pithos-kit/plan)

Enforced read-only planning for Pi, with controlled plan creation, a minimal Plan theme, and contextual session naming.

## Install

```bash
pi install npm:@pithos-kit/plan
```

For local development:

```bash
pi install -l ./pithos.plan
```

## Pithos `.pithos` config

```yaml
pi:
  extensions:
    "@pithos-kit/plan": "npm:0.1.0"
```

## Usage

```text
/plan <task>
/plan --help
```

Plan mode explores the codebase with trusted read-only tools, resolves design decisions, and creates an approved implementation plan under `.pi/plans/`. The controlled `create_plan` tool uses exclusive file creation and exits Plan mode only after a successful approved save.

While active, Plan mode exposes trusted built-in `read`, `grep`, `find`, and `ls` plus the internal plan creator. It blocks model mutations and manual `!`/`!!` shell commands, temporarily applies the bundled Plan theme, and shows the canonical session name in its footer.

After a successful save, Plan mode restores the previous theme and tools and replaces the current session name with the approved plan's outcome-focused title in lowercase kebab-case. A missing or generic title falls back to the task-derived plan filename. Declined, continued, cancelled, and failed plan creation does not rename the session.

### Enforcement boundary

Plan mode enforces Pi's tool and user-shell interfaces; it is not an operating-system sandbox. Other extensions and external processes can still mutate files directly.
