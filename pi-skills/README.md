# @anton-kochev/pi-skills

[![npm version](https://img.shields.io/npm/v/@anton-kochev/pi-skills)](https://www.npmjs.com/package/@anton-kochev/pi-skills)

Anton Kochev's pi skills and prompt commands.

Use `/plan` when you want the agent to explore before asking questions, reach explicit shared understanding, save a plan under `.pi/plans/`, and only then implement. Plan mode is enforced read-only: Pi exposes only trusted built-in read/search tools plus a controlled plan writer, blocks source edits, shell commands, user `!` commands, and custom tools, and preserves the previous tool set for restoration. The extension gives each plan a sortable UTC timestamp and readable task-derived name, such as `2026-08-05-132751-save-plan-storage.md`; collisions advance the timestamp instead of overwriting or adding a numeric suffix. The bundled `plan` theme replaces the standard footer with a subtly fading `● planning` indicator, but enforcement remains active even if the theme cannot load. When the agent is ready to write the generated plan—or when you run `/plan` again—Pi asks interactively whether to create the plan and proceed to implementation or continue planning. Only approval permits the exact plan write; declining keeps Plan mode read-only and active. After a successful approved write, Pi restores the previous theme and tools and implementation can begin.

Use `/commit` to stage relevant files when intent is clear and generate a Conventional Commits 1.0.0 message — problem-framed subjects, subject-only by default, with a body only when it earns its place.

Use `/srs` to create an ISO/IEC/IEEE 29148:2018 Software Requirements Specification with EARS requirements, explicit approval gating, and a traceability matrix.

Use the `tdd` skill when you want the agent to build or change non-trivial logic test-first with the red-green-refactor loop.

## Install

```bash
pi install npm:@anton-kochev/pi-skills
```

For local development from this repository:

```bash
pi install -l ./pi-skills
```

## Usage

Invoke prompt commands directly:

```text
/plan <your task>
/commit [instructions]
/srs <product or change description>
```

These are prompt templates, so they are manual-only: they appear as slash commands rather than being auto-selected as skills.

The TDD workflow is packaged as a skill. Pi can load it proactively for matching requests, or you can force it with:

```text
/skill:tdd <your task>
```

## Changelog

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
