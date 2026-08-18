# @pithos-kit/skills

[![npm version](https://img.shields.io/npm/v/@pithos-kit/skills)](https://www.npmjs.com/package/@pithos-kit/skills)

SRS prompting and test-driven development guidance for Pi.

Use `/srs` to create an ISO/IEC/IEEE 29148:2018 Software Requirements Specification with EARS requirements, explicit approval gating, and a traceability matrix.

Use the `tdd` skill when you want the agent to build or change non-trivial logic test-first with the red-green-refactor loop.

Plan mode is now published independently as [`@pithos-kit/plan`](https://www.npmjs.com/package/@pithos-kit/plan). When adopting the split, update Skills to 0.5.0 or later and install the Plan package at the same time; combining it with Skills 0.4.0 or earlier creates duplicate `/plan` handlers.

## Install

```bash
pi install npm:@pithos-kit/skills
```

For local development from this repository:

```bash
pi install -l ./pithos.skills
```

## Pithos `.pithos` config

```yaml
pi:
  extensions:
    "@pithos-kit/skills": "npm:0.5.0"
```

## Usage

Invoke the SRS prompt directly:

```text
/srs <product or change description>
/srs --help
```

The command accepts `--help` or `-h` before prompt expansion, so asking for help does not start an agent turn. The TDD workflow is packaged as a skill that Pi can load proactively for matching requests.

Force the TDD skill with:

```text
/skill:tdd <your task>
/skill:tdd --help
```

The help invocation is intercepted before the skill is expanded.

## Changelog

### 0.5.0

- Move Plan mode, controlled plan creation, and the Plan theme to `@pithos-kit/plan`.
- Keep `/srs` and `/skill:tdd` help handling in Skills without activating their prompt or skill.

### 0.4.0

- Move `/commit` and the `conventional-commit` skill to `@pithos-kit/atlas`.
- Use the controlled `create_plan` confirmation as the sole final approval gate once planning decisions are resolved.

### 0.3.2

- Create generated plans atomically through a dedicated controlled tool so late path collisions cannot overwrite existing files.
- Clarify the Plan mode enforcement boundary and behavior without an interactive UI.

### 0.3.1

- Enforce read-only Plan mode across built-in, custom, and user-shell tools, with fail-closed activation and branch-scoped state restoration.
- Require interactive approval for the exact generated plan write; continuing stays in Plan mode, while a successful approved write exits and authorizes implementation.

### 0.3.0

- Ask whether to create the generated plan file when exiting an active `/plan` session.
- Add an automatic temporary minimal `plan` theme and replace the standard footer with a subtly fading `● planning` indicator while `/plan` is active.
- Save plans under `.pi/plans/` with unique, timestamp-prefixed readable names instead of overwriting a root `PLAN.md` or adding numeric suffixes.
- Fix cancelled `/plan` sessions continuing to influence later model turns through stale prompt history.

### 0.2.0

- `/commit`: infer and stage relevant files when commit intent is clear, while preserving staged-only commits and avoiding local artifacts.

### 0.1.3

- Fix `/plan` prompt command discovery by quoting its YAML frontmatter description.

### 0.1.2

- Add `/srs` prompt command for ISO/IEC/IEEE 29148:2018 SRS generation with EARS requirements and traceability.

### 0.1.1

- `/commit`: reconcile the subject-mood rule with the problem-framed examples (declarative when stating a problem, imperative when describing value), default to subject-only bodies, and fix an over-length breaking-change example.

### 0.1.0

- Initial release: `/plan` and `/commit` prompt commands plus the `tdd` skill.
