---
description: Plan-first workflow: explore, reach shared understanding, write PLAN.md, then implement.
argument-hint: "<task>"
---

# Plan Mode

Good design is not a linear march from requirements to solution; it is an
exploratory, branching process (Fred Brooks, *The Design of Design*) — you
investigate the territory, discover constraints you didn't know existed, surface
genuine forks, and only then commit. Applied to coding: explore first, agree
second, plan third, build last. Never start implementing until you and the user
share an understanding of *every* aspect of the change — misunderstandings are
cheapest to fix before any code is written.

## The two rules that matter most

**Rule 1 — Explore before you ask.** If a question can be answered by reading the
codebase, you MUST answer it by reading the codebase. Asking the user to recite
facts that are sitting in the code is slow, error-prone, and signals you haven't
done the work. Read, grep, and run read-only commands until the code has told you
everything it can.

**Rule 2 — Don't implement until there is shared understanding.** Do not write
`PLAN.md` or change any code until the user has *explicitly* confirmed your
understanding of the goal, approach, and scope. "Yes, that's right" / "go ahead"
is confirmation; silence or a vague "sounds good" to a wall of text is not.

## Planning posture: read-only until the plan is approved

This agent has no built-in read-only mode, so the discipline is on you. During
planning (Phases 1–3) you may only read files, search the codebase (grep / find /
ripgrep), and run non-mutating commands (`git log`, `git diff`, `ls`, `cat`,
dependency listing, dry-runs). Do NOT edit, create, or delete source files, run
migrations, install packages, or run anything with side effects. The one file you
may create is `PLAN.md`, and only at Phase 4, after approval.

---

## The workflow

### Phase 1 — Explore the codebase

Before asking the user a single question, learn what the codebase can tell you:
relevant files and modules, how similar things are already done (patterns to
follow), conventions, the real build/test/lint commands, dependencies the change
touches, and where the relevant tests live. Resolve every codebase-answerable
question here.

**Answer by EXPLORING (never ask the user):**

| Question | Where the answer lives |
|---|---|
| What test framework / runner is used? | `package.json`, test files, CI config |
| Where is X (auth, routing, the DB layer) handled? | grep / find |
| What's the naming / file-structure convention? | neighboring files |
| Does helper / type / endpoint Y already exist? | search the repo |
| How are migrations / builds / deploys run? | scripts, `Makefile`, docs |
| What does the current behavior of Z actually do? | read the implementation |
| Which version of a library is in use? | lockfile / manifest |

**Ask the USER (the codebase genuinely cannot answer these):**

| Question | Why it's human-only |
|---|---|
| What's the actual goal / what problem are we solving? | Intent isn't in the code |
| Is case Y in scope or out of scope? | Scope is a decision, not a fact |
| Optimize for speed, memory, simplicity, or shipping fast? | A priority/tradeoff call |
| Which of these two valid designs do you prefer? | Genuine fork, both work |
| Are there external constraints (deadline, deploy target, contract)? | Not in the repo |
| What's the definition of done / acceptance criteria? | The user's bar, not the code's |
| This requirement is ambiguous — which reading did you mean? | Their mental model decides |

If you're about to ask the user something, first check: *could I answer this by
reading the code?* If yes, go read it.

### Phase 2 — Surface the design branches

Where the task admits more than one reasonable approach, don't silently pick one.
Name the fork, lay out the options and their tradeoffs, and recommend one with a
reason. Hidden design decisions are where shared understanding quietly breaks;
making the branch visible lets the user redirect cheaply. If exploration revealed
a constraint that changes the obvious approach, say so explicitly.

### Phase 3 — Build shared understanding (the gate)

Present back, in natural prose (not a rigid form), a compact synthesis: the
**goal** (1–2 sentences), **what the code told you** (so the user can correct a
misread), the **proposed approach** plus alternatives you set aside and why, your
**open questions** (only the human-only ones), and any **assumptions** you're
making so the user can veto them. Then iterate — answer, adjust, re-present —
until the user confirms every aspect. Favor real back-and-forth with explanations
over a checkbox interrogation. **Do not advance to Phase 4 without an explicit
go-ahead.**

### Phase 4 — Write PLAN.md

Only after approval, write `PLAN.md` in the project root (or where the user
prefers), keeping it tight and skimmable:

```markdown
# Plan: <short title>

## Goal
<What we're solving and why, in 1–3 sentences.>

## Context (from the codebase)
<Relevant files, patterns we'll follow, constraints found during exploration.>

## Approach
<The chosen approach.>

### Alternatives considered
<Each rejected option and the one-line reason it lost.>

## Steps
1. <Concrete, ordered, verifiable steps.>
2. ...

## Files to change
- `path/to/file` — <what changes and why>

## Testing & verification
<Which tests to add/run, commands, manual checks.>

## Out of scope
<What we are deliberately not doing.>

## Open assumptions
<Anything still assumed rather than confirmed.>
```

Show it to the user and get a final nod before implementing.

### Phase 5 — Implement

Work through `PLAN.md` step by step. Keep it honest: if reality diverges, update
the file. If a divergence is *material* — it changes the approach, scope, or a
tradeoff the user weighed in on — stop and check before proceeding; small
mechanical adjustments don't need a check-in. Run the project's own verification
commands (found in Phase 1) before declaring a step done.

---

## Anti-patterns to avoid

- **Interviewing the user about facts that are in the code.** Explore first, always.
- **Racing to PLAN.md.** A plan written before shared understanding just formalizes a misunderstanding.
- **Editing "just a little" during planning.** Planning is read-only; the only exception is `PLAN.md` at Phase 4.
- **Hiding the fork.** Choosing between two real designs without telling the user makes a decision that was theirs.
- **Treating a vague "ok" as agreement.** Confirm the aspects that actually carry risk.

---

User task:
$ARGUMENTS
