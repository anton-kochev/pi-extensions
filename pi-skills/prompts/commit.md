---
description: Generate git commits following Conventional Commits 1.0.0.
argument-hint: "[instructions]"
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
   - If files are already staged, commit only staged files.
   - If nothing is staged and the user provided a clear scope, stage only files matching that scope.
     - Example: “changes to the /answer extension” means stage modified files under `answer/`.
   - If nothing is staged and the scope is obvious from the working tree, stage the relevant modified tracked files.
   - Do not stage unrelated untracked files, generated files, editor metadata, session logs, or local config unless explicitly requested.
   - If the intended files are ambiguous, suggest the files to stage and ask for confirmation.

3. **Stage selected files when appropriate**:

   ```bash
   git add <relevant-files>
   ```

4. **Analyze staged changes** and determine:
   - Filter out trivial changes (see below)
   - Ask: **"what problem does this solve?"** — use that as the subject
   - Primary type (feat, fix, docs, etc.)
   - Scope if applicable (component, module, or file area)
   - Whether description paragraph or bullet points add value

5. **Generate commit** using HEREDOC for proper formatting:

   ```bash
   git commit -m "$(cat <<'EOF'
   type(scope): subject

   Optional description paragraph.

   - optional bullet
   - optional bullet
   EOF
   )"
   ```

6. **Verify** the commit was created:

   ```bash
   git log -1
   ```

If no staged changes exist, infer and stage relevant files when the user’s intent is clear. If intent is unclear, show the proposed staging set and ask for confirmation.

## Staging Rules

- Prefer staged files when present; never add extra files to an already staged commit unless explicitly asked.
- When auto-staging, stage only files relevant to the user’s stated scope.
- Modified tracked files may be staged automatically when relevant.
- Untracked files require stronger evidence before staging.
- Never stage obvious local/session artifacts unless explicitly requested.

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
- **Never** use `--no-verify` unless explicitly requested
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

---

Additional user instructions, if any:

$ARGUMENTS
