---
name: conventional-commit
description: "Create Conventional Commits from existing staged changes or a narrow staging set inferred from instructions and task context, with mandatory interactive confirmation. Use for /commit, git commit, or when committing changes."
user-invocable: true
disable-model-invocation: false
---

# Git Commit Generator

Generate git commit messages following the [Conventional Commits 1.0.0](https://www.conventionalcommits.org/en/v1.0.0/) specification.

## Commit Message Format

```plain
<type>[optional scope]: <subject>

[optional description paragraph]

[optional bullet points]

[optional footer(s)]
```

**Default to a subject line only.** Add a description paragraph or bullets only when they carry something the subject and diff don't already make obvious. Most commits need just the subject — reach for a body, don't default to one.

### Subject (mandatory)

One sentence. Lowercase, no period, ≤72 chars. Declarative when stating a problem ("users locked out after reset"); imperative when describing added value ("add date-range filter").

**Primary goal: answer "what problem does this change solve?"**

Lead with the symptom or outcome — not the technical mechanism:

- Prefer: `fix(auth): users locked out after password reset`
- Avoid: `fix(auth): fix token expiry logic in resetPassword`

When no problem framing fits (greenfield feature, pure refactor) — describe the value added instead. Don't force it.

### Description paragraph (optional)

Up to 3 sentences, plain prose. Answers **"what value does this add?"**

Include only when there's a clear, non-obvious answer. Omit otherwise. Does not restate the subject.

### Bullet points (optional)

Technical details and implementation notes — explain **why** each change was made (the reasoning behind the decision, not the mechanism). Use when the change is non-trivial and benefits from a breakdown. One point per logical change, lowercase, concise.

## Types

| Type | Description |
| ------ | ------------- |
| `feat` | New feature (correlates with MINOR in SemVer) |
| `fix` | Bug fix (correlates with PATCH in SemVer) |
| `docs` | Documentation only changes |
| `style` | Code style (formatting, semicolons, etc.) - no logic change |
| `refactor` | Code change that neither fixes a bug nor adds a feature |
| `perf` | Performance improvement |
| `test` | Adding or correcting tests |
| `build` | Build system or external dependencies |
| `ci` | CI configuration files and scripts |
| `chore` | Other changes that don't modify src or test files |

## Breaking Changes

For breaking changes, either:

- Add `!` before the colon in the header: `feat(api)!: subject`
- Add `BREAKING CHANGE:` footer in body

Breaking changes correlate with MAJOR in SemVer.

## Workflow

When the user invokes `/commit`:

1. **Inspect repository state**:

   ```bash
   git status --short
   git diff
   git diff --cached
   ```

2. **Determine commit scope**:
   - If files are already staged, commit only staged files; do not add other changes unless the user explicitly asks.
   - If nothing is staged, infer the intended scope from explicit `/commit` instructions first, then the current conversation and task context, and finally the working tree.
   - If nothing is staged and the inferred scope is clear, stage only the relevant files.
   - Before any `git add`, inspect each candidate file's diff (for example, `git diff -- <candidate-files>`), not just its path or status.
   - If a candidate file contains mixed-scope or unrelated hunks, do not stage the whole file. Show the exact hunk selection and ask the user to confirm it; use an explicit interactive/patch staging method only after confirmation, or ask the user to stage the hunks when safe selective staging is unavailable.
   - Include untracked files only when the instructions or task context clearly identify them as part of the intended change.
   - Do not stage unrelated untracked files, generated files, editor metadata, session logs, or local configuration unless explicitly requested.
   - If the intended files or hunks are ambiguous, show the exact proposed staging set and ask for confirmation before staging or committing.

3. **Stage selected files when appropriate**:

   ```bash
   git diff -- <relevant-files>
   git add -- <relevant-files>
   git diff --cached
   ```

   Whole-file `git add` is appropriate only after inspection shows every hunk in that file belongs to the intended scope. Never silently include unrelated hunks. If the selected files produce no staged changes, report that state and stop.

4. **Analyze staged changes** and determine:
   - Filter out trivial changes (see below)
   - Ask: **"what problem does this solve?"** — use that as the subject
   - Primary type (feat, fix, docs, etc.)
   - Scope if applicable (component, module, or file area)
   - Whether description paragraph or bullet points add value

5. **Request mandatory interactive confirmation and create the commit**:
   - Call `create_commit` with the complete final commit message.
   - The controlled tool detects an active merge before opening confirmation and rechecks immediately before invoking the commit. If a merge is active, it refuses without creating a merge commit; the user must resolve or complete the merge outside this controlled normal-commit workflow.
   - Before anything is displayed, the controlled tool captures the approved HEAD identity and index tree: the resolved hash or unborn state, the symbolic ref name versus detached state, and the exact staged tree. It generates both the summary and complete diff from immutable Git objects (the captured target tree, or the empty tree for an unborn branch, to the captured index tree), never from a later read of the mutable index.
   - The controlled tool shows the message, a useful file summary, and the complete staged diff in the interactive confirmation dialog. Approval is bound to that exact target and staged tree; after confirmation it rechecks the HEAD identity, resolved hash, and index tree. A same-tip branch switch or any other change requires fresh approval.
   - Cancellation remains effective through approval and the final pre-mutation check. The `git commit` invocation and all outcome verification or reconciliation form a non-cancellable critical section so a possibly-created commit is never abandoned half-reconciled.
   - The controlled invocation uses `--cleanup=verbatim`, so repository cleanup configuration cannot normalize the approved full message.
   - Never run `git commit` directly through bash or any other tool. Shell-command blocking is conservative defense in depth, not a security sandbox and not an alternative commit path.
   - If the user explicitly requested `--no-verify`, pass `noVerify: true` to `create_commit`; otherwise omit it. The confirmation must prominently disclose that hooks will be bypassed.
   - If the user declines, the staged changes remain intact and the workflow stops.

6. **Report the controlled result**:
   - After a successful Git process, `create_commit` inspects the exact captured ref independently of whichever ref HEAD may then denote. Ordinary success requires the observed root transition for an approved unborn target or single-parent transition from the rechecked approved hash to match the exact approved tree and full message. Extra or unexpected parents, including normal intervening commits, are ambiguous.
   - A mismatching root or sibling transition cannot be cryptographically tied to this invocation. If the tree, message, parent shape, captured target, or HEAD identity does not pass exact post-commit verification, the tool returns `commit-reconciliation-required` with `committed: false` and exposes the observed hash and captured target for inspection.
   - If HEAD identity changes after the commit, the tool never claims ordinary success. A symbolic target remains independently inspectable, while a changed detached HEAD requires manual reconciliation rather than an update to whichever target HEAD later denotes.
   - If Git reports failure and the captured target advanced, the tool returns reconciliation-required without using stdout to claim the transition.
   - For every post-mutation reconciliation outcome, the controlled workflow does not attempt ref recovery or rollback and does not modify the refs, index, or worktree further. Git or hooks may already have advanced the captured target; inspect the refs, index, and worktree before retrying to avoid duplicate commits. The tool never discards an intervening commit; that safety takes precedence over automatic cleanup.
   - Report success only when the tool says `committed: true`; otherwise stop without claiming a commit was created.

## Context-Based Staging Rules

- Existing staged changes always take precedence over inferred context.
- Narrow scope using explicit instructions, named packages or paths, and the active task before considering broader working-tree patterns.
- Never infer scope from modification time alone.
- When multiple unrelated change groups or mixed-scope hunks remain plausible, ask for confirmation instead of guessing.
- Interactive approval through `create_commit` is mandatory even when the staging scope is unambiguous; rely on its full cached diff review as the final approval boundary.

## Filtering Trivial Changes

Ignore changes that don't affect functionality or user experience:

- Whitespace adjustments (indentation, line breaks, trailing newlines)
- Code formatting/style changes (line wrapping, bracket positioning)
- Comment formatting
- Import reordering without additions/removals

Only document changes with semantic meaning or technical impact. For pure formatting commits, use simple descriptions like "format code" or "apply linting fixes".

## Rules

- Subject answers "what problem does this solve?" when possible
- Subject must be lowercase; declarative when problem-framed ("users locked out after reset"), imperative when value-framed ("add feature" not "added feature")
- No period at end of subject
- Keep subject under 72 characters
- Scope is optional but recommended for larger codebases
- Description paragraph: only include when there's a clear, non-obvious answer to "what value does this add?"
- Bullet points: technical details / implementation notes that explain why each change was made, one point per logical change
- Default to subject-only; add a body only when it earns its place
- Be concise — avoid redundant or verbose language
- **Never** use `--no-verify` unless explicitly requested; `noVerify: true` is allowed only for that explicit request, only through `create_commit`, and never through a direct shell commit
- The confirmation must prominently warn that hooks will be bypassed whenever `noVerify: true` is used
- **Never** amend commits that have been pushed to remote
- **Never** include Co-Authored-By footers in commit messages

## Examples

**Subject only (simple change):**

```plain
docs: missing setup step in README
```

**Fix — problem-framed subject + full 3-part body:**

```plain
fix(auth): users locked out after password reset

Reset tokens were invalidated immediately on generation,
so the confirmation email always arrived with an expired link.

- token expiry moved to first use — creation-time expiry killed links before delivery
- integration test added because unit mocks couldn't reproduce the timing window
```

**Feature with scope:**

```plain
feat(api): no way to query enrichment results by date range

- date filtering was the top support request from enterprise customers
- ISO 8601 chosen for consistency with existing timestamp fields
```

**Subject + description (no bullets needed):**

```plain
fix(validation): form submission silently drops rows with empty dates

Previously empty dates caused a NullReferenceException that was swallowed.
Now validates and rejects rows with empty required fields with a clear error.
```

**Breaking change:**

```plain
feat(api)!: clients can't tell enrichment errors from empty results

BREAKING CHANGE: Response now returns JSON wrapper with metadata
instead of raw CSV. Clients must update parsing logic.
```

**Multiple changes (pick primary):**
When changes span multiple types, use the most significant one and mention others in body.
