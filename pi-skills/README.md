# @anton-kochev/pi-skills

Anton Kochev's pi skills and prompt commands.

Use `/plan` when you want the agent to explore before asking questions, reach explicit shared understanding, write a `PLAN.md`, and only then implement.

Use `/commit` to generate a git commit from staged changes using Conventional Commits 1.0.0.

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
```

These are prompt templates, so they are manual-only: they appear as slash commands rather than being auto-selected as skills.

The TDD workflow is packaged as a skill. Pi can load it proactively for matching requests, or you can force it with:

```text
/skill:tdd <your task>
```
