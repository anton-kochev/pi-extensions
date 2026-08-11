# @pithos-kit/skills

[![npm version](https://img.shields.io/npm/v/@pithos-kit/skills)](https://www.npmjs.com/package/@pithos-kit/skills)

Anton Kochev's Pi skills and prompt commands.

## Plan mode

Use `/plan` when you want the agent to explore before asking questions, reach explicit shared understanding, save a plan under `.pi/plans/`, and only then implement.

While Plan mode is active, Pi exposes only the trusted built-in `read`, `grep`, `find`, and `ls` tools plus an internal `create_plan` tool. Source edits, model shell commands, custom tools, and manual `!`/`!!` shell commands are blocked. The internal plan creator is hidden outside Plan mode and uses exclusive file creation, so a plan that appears after path generation is never overwritten; the timestamp advances until an unused path is created.

Each plan receives a sortable UTC timestamp and readable task-derived name, such as `2026-08-05-132751-save-plan-storage.md`. The bundled `plan` theme replaces the standard footer with a subtly fading `● planning` indicator, but enforcement remains active if the theme cannot load. When the agent is ready to create the plan—or when you run `/plan` again—Pi asks whether to create it and proceed to implementation or continue planning. Approval permits the controlled plan creation; declining keeps Plan mode read-only and active. After successful creation, Pi restores the previous theme and tools and implementation can begin.

Plan creation requires an interactive UI. Without one, creation attempts are blocked and Plan mode remains active.

### Enforcement boundary

Plan mode prevents model-initiated project mutation through Pi's tool interface and intercepts manual user shell commands. It is extension-level enforcement, not an operating-system sandbox: slash commands and event handlers implemented by other extensions, direct filesystem or `pi.exec()` calls inside extension code, and external processes remain outside this boundary. Use an OS sandbox or container when no process may mutate the filesystem.

Use `/commit` to stage relevant files when intent is clear and generate a Conventional Commits 1.0.0 message — problem-framed subjects, subject-only by default, with a body only when it earns its place.

Use `/srs` to create an ISO/IEC/IEEE 29148:2018 Software Requirements Specification with EARS requirements, explicit approval gating, and a traceability matrix.

Use the `tdd` skill when you want the agent to build or change non-trivial logic test-first with the red-green-refactor loop.

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
    "@pithos-kit/skills": "npm:0.3.2"
```

## Usage

Invoke prompt commands directly:

```text
/plan <your task>
/commit [instructions]
/srs <product or change description>
/plan --help
/commit --help
/srs --help
```

Each command accepts `--help` or `-h` before prompt expansion, so asking for help does not start an agent turn or activate Plan mode.

These are prompt templates, so they are manual-only: they appear as slash commands rather than being auto-selected as skills.

The TDD workflow is packaged as a skill. Pi can load it proactively for matching requests, or you can force it with:

```text
/skill:tdd <your task>
/skill:tdd --help
```

The help invocation is intercepted before the skill is expanded.

## Changelog

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
