# @anton-kochev/pi-skills

[![npm version](https://img.shields.io/npm/v/@anton-kochev/pi-skills)](https://www.npmjs.com/package/@anton-kochev/pi-skills)

Anton Kochev's pi skills and prompt commands.

Use `/plan` when you want the agent to explore before asking questions, reach explicit shared understanding, write a `PLAN.md`, and only then implement.

Use `/commit` to generate a Conventional Commits 1.0.0 message from staged changes — problem-framed subjects, subject-only by default, with a body only when it earns its place.

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

### 0.1.2

- Add `/srs` prompt command for ISO/IEC/IEEE 29148:2018 SRS generation with EARS requirements and traceability.

### 0.1.1

- `/commit`: reconcile the subject-mood rule with the problem-framed examples (declarative when stating a problem, imperative when describing value), default to subject-only bodies, and fix an over-length breaking-change example.

### 0.1.0

- Initial release: `/plan` and `/commit` prompt commands plus the `tdd` skill.
