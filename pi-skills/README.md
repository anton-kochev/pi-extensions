# @anton-kochev/pi-skills

[![npm version](https://img.shields.io/npm/v/@anton-kochev/pi-skills)](https://www.npmjs.com/package/@anton-kochev/pi-skills)

Anton Kochev's pi skills and prompt commands.

Use `/plan` when you want the agent to explore before asking questions, reach explicit shared understanding, save a plan under `.pi/plans/`, and only then implement. The extension preserves a readable task-derived name behind a sortable UTC timestamp, such as `2026-08-05-132751-save-plan-storage.md`. If that path already exists, it advances the timestamp instead of adding a numeric suffix. The bundled `plan` theme is enabled automatically while `/plan` is active and replaces the standard footer with only a subtly fading `● planning` indicator. The previous theme and standard footer return after the generated plan is written. Run `/plan` again before the plan is written to choose whether to create it before exiting: confirm to ask the agent to finalize and save it, or decline to cancel planning and restore the normal interface. After cancellation, subsequent turns explicitly ignore the stale Plan Mode instructions already stored in conversation history.

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

### Unreleased

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
