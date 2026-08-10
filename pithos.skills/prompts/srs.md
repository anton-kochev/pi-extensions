---
name: srs-generator
description: >-
  Produce a Software Requirements Specification (SRS) conforming to
  ISO/IEC/IEEE 29148:2018, with requirements written in EARS notation and a
  traceability matrix. A user-executable command: elicit what the codebase
  can't tell you, draft and self-check the requirements, gate on explicit
  approval, then emit a tailored SRS document. Use this skill whenever the user
  asks to create, write, draft, author, or "spec out" a software requirements
  specification, an SRS, a requirements document, or a formal requirements spec
  — for a brand-new (greenfield) product or for a change to an existing
  codebase. Also use it when the user mentions "ISO 29148", "IEEE 830",
  "functional and non-functional requirements", or wants requirements captured
  before any user-stories or backlog work.
---

# SRS Generator

> **User-executable skill** — invoke deliberately (e.g. as a slash command).
> This skill does not trigger itself; the user asks for an SRS.

Produce a Software Requirements Specification that conforms to the structure and
quality rules of **ISO/IEC/IEEE 29148:2018** (the current standard, which
superseded IEEE 830-1998). Requirements are written in **EARS** notation so they
are unambiguous by construction, every requirement carries a stable ID, and the
document ends with a traceability matrix.

The discipline is plan-first: explore what already exists, reach explicit shared
understanding, and only then commit the artifact. An SRS written before agreement
just formalizes a misunderstanding.

One thing to be clear about up front, because it shapes the whole flow: an SRS is
a **convergent** document. It specifies *what* the system must do and deliberately
not *how* — so solution-design exploration does not belong here. The genuinely
exploratory, branching part of this work lives in the **elicitation**: Phases 2
and 5 form a loop you repeat until the picture is stable, and the forks you
surface are **scope and ambiguity** forks ("is Y in or out?", "which reading did
you mean?"), never design forks. Don't import architecture/algorithm branching
into a requirements spec.

## The two rules that matter most

**Rule 1 — Establish before you ask.** If a fact can be obtained by reading the
codebase, the uploads, or the conversation, get it that way. Never ask the user
to recite something the available material already encodes (existing endpoints,
data models, current behavior, the stack in use). Reserve your questions for what
no artifact can answer: intent, scope, priorities, and external constraints.

**Rule 2 — Don't write the SRS until there is shared understanding.** Do not emit
the document until the user has *explicitly* confirmed the goal, scope, and the
shape of the requirements. "Yes, that's right" / "go ahead" is confirmation;
silence or a vague "sounds good" to a wall of text is not.

## Posture: discovery is read-only

During Phases 0–5 you may only read files, search the codebase, and run
non-mutating commands. Do **not** edit, create, or delete source files, run
migrations, or install packages. The single file you may create is the SRS
itself, and only at Phase 6, after approval.

---

## The workflow

### Phase 0 — Locate inputs and pick the mode

Gather what already exists before asking for anything:

- Check `/mnt/user-data/uploads/` for briefs, PRDs, prior specs, transcripts,
  diagrams. If an input is a PDF or `.docx`, read it with the appropriate reading
  skill first.
- Check the conversation for requirements already stated.
- Detect whether a **codebase** is present in the working directory.

This sets the **mode**:

- **Greenfield** (no relevant codebase) → go straight to elicitation; ground
  yourself in the brief/uploads instead.
- **Existing-codebase** (a repo is present and the SRS describes a change or an
  addition to it) → do Phase 1 exploration to ground requirements in reality.

State the detected mode in one line so the user can correct it.

### Phase 1 — Ground yourself (existing-codebase mode)

Exhaustively learn what the code and docs can tell you, so requirements reflect
the system as it actually is. Build a map of: the relevant modules and their
current behavior, the data models and external interfaces already in place, the
stack and versions in use (read the lockfile/manifest), and any existing
requirement or design docs. Anything you can read here is a question you will not
put to the user.

In greenfield mode, do the equivalent against the brief and uploads.

### Phase 2 — Elicit the human-only inputs

Now ask the user — in natural prose, a real back-and-forth, not a rigid
questionnaire — only for what no artifact can supply. Cover, as needed:

| Topic | Why it's human-only |
|---|---|
| Goal / problem being solved | Intent isn't in the code |
| Scope: what's explicitly **in** and **out** | Scope is a decision, not a fact |
| User roles / actors and their characteristics | Whose needs the system serves |
| Quality priorities (perf, security, availability, usability…) and their **relative** weight | A tradeoff call |
| Hard constraints: platform, deadline, budget, regulatory | Not in the repo |
| External systems / interfaces it must integrate with | The boundary is a decision |
| Data: entities, retention, sensitivity, residency | Domain knowledge |
| Compliance obligations (GDPR, HIPAA, accessibility…) | External to the code |
| Definition of done / acceptance criteria | The user's bar |

**Surface scope and ambiguity forks — don't silently resolve them.** Where a
requirement admits more than one reasonable reading, where a feature could be in
or out of scope, or where exploration revealed a constraint that changes the
picture, name the fork, lay out the options and their tradeoffs, and recommend one
with a reason. Hidden decisions are where shared understanding quietly breaks.
These are requirements forks, not design forks: don't propose architectures or
implementations — keep the choices at the level of *what* and *whether*, not
*how*.

Elicitation is iterative, not a single pass. Expect to discover requirements you
didn't know about and to revise scope as you learn. Loop between this phase and
the Phase 5 gate — ask, draft, present, adjust — until the picture stops moving.

### Phase 3 — Draft requirements in EARS, with IDs

Turn the agreed material into atomic requirements. Write each functional
requirement using an **EARS** pattern (see reference below) and assign a stable
ID. Group by feature area. Classify each as functional, non-functional/quality,
interface, or constraint.

ID scheme (keep it consistent; downstream tooling relies on it):

- `FR-NNN` — functional requirement
- `NFR-NNN` — non-functional / quality requirement
- `IFR-NNN` — external interface requirement
- `CON-NNN` — constraint
- `ASM-NNN` — assumption

### Phase 4 — Self-check against the nine characteristics

Before showing anything, audit every requirement against the 29148 quality
characteristics (reference below). Fix or flag failures. A requirement that
can't be made verifiable, or hides two requirements in one sentence, gets split
or rewritten — not shipped. Leave **no** `TBD`/`TBS`/`TBR` placeholders silently;
either resolve them with the user or list them as open assumptions.

### Phase 5 — Confirm (the gate)

Present back a compact synthesis in prose: the **goal** (1–2 sentences), **what
the material told you** (so the user can correct a misread), the **scope** (in and
out), the **headline requirements** and any forks you resolved, your **open
questions**, and your **assumptions** so the user can veto them. Iterate until the
user confirms every aspect.

**Do not advance to Phase 6 without an explicit go-ahead.**

### Phase 6 — Emit the SRS

Only after approval, write the document to a file (`SRS.md` in the project root
unless the user specifies otherwise; offer a `.docx` version if they want a
formal deliverable). Use the section template below, **tailored** to the project:
prune sections that genuinely don't apply rather than emitting empty headings,
and say in the document overview which sections were omitted and why. Every
requirement keeps its ID, and the traceability matrix closes the document.

After writing, present the file and give a 2–3 sentence summary. Its stable
requirement IDs, feature grouping, and measurable acceptance criteria make it
straightforward to derive a backlog or user stories from it later.

---

## Reference — EARS notation

EARS (Easy Approach to Requirements Syntax; Mavin et al., RE'09) constrains a
requirement into one of a few patterns. Always use "**shall**" for a mandatory
requirement. Clauses appear in a fixed order.

| Pattern | Template | Example |
|---|---|---|
| **Ubiquitous** (always active) | The `<system>` shall `<response>`. | The system shall encrypt all stored credentials at rest. |
| **Event-driven** | When `<trigger>`, the `<system>` shall `<response>`. | When a user submits the login form, the system shall validate the credentials within 2 seconds. |
| **State-driven** | While `<state>`, the `<system>` shall `<response>`. | While the account is locked, the system shall reject all sign-in attempts. |
| **Optional-feature** | Where `<feature is included>`, the `<system>` shall `<response>`. | Where SSO is enabled, the system shall redirect the user to the identity provider. |
| **Unwanted-behavior** | If `<condition>`, then the `<system>` shall `<response>`. | If the password is entered incorrectly five times, then the system shall lock the account for 15 minutes. |
| **Complex** | Combine the above (e.g. While … when … shall …). | Use sparingly; if it needs more than ~3 preconditions, switch to a decision table or state diagram. |

EARS is for behavioral requirements. For requirements that aren't conditional
behavior (some architectural constraints, certain quality targets), state them
plainly but keep them measurable. EARS suits functional requirements far better
than free-form prose; non-functional requirements still need concrete numbers.

The underlying 29148 sentence shape is `[Condition] [Subject] [Action] [Object]
[Constraint of action]` — EARS is a friendly specialization of it.

## Reference — the nine characteristics of a well-formed requirement

Audit each requirement (29148:2018):

1. **Necessary** — removing it would leave a gap; it earns its place.
2. **Appropriate** — states *what*, not *how*; doesn't over-constrain the design.
3. **Unambiguous** — exactly one interpretation.
4. **Complete** — needs no further information to be acted on; no dangling TBDs.
5. **Singular** — one capability per requirement (watch for "and"/"and/or").
6. **Feasible** — achievable within technology, cost, and schedule.
7. **Verifiable** — can be confirmed by test, demonstration, inspection, or
   analysis; it is measurable.
8. **Correct** — accurately represents the real need.
9. **Conforming** — follows the agreed template/style (here, EARS + IDs).

And the **set** as a whole should be: complete (covers the scope), consistent (no
contradictions), comprehensive, bounded, and free of TBD/TBS/TBR.

**Banned vague words** (they make a requirement unverifiable): *easy, fast, rapid,
user-friendly, flexible, robust, efficient, support, etc., and/or, as
appropriate, minimize, maximize*. Replace each with a measurable condition —
"loads in under 2 seconds on a 3G connection," not "is fast."

## Reference — SRS document template (tailor; prune what doesn't apply)

```markdown
# Software Requirements Specification — <Product / System Name>
<version · date · author · status>

## 1. Introduction
### 1.1 Purpose
### 1.2 Scope (in scope / out of scope)
### 1.3 Intended audience and document use
### 1.4 References
### 1.5 Definitions, acronyms, and abbreviations
### 1.6 Document overview (note any tailored-out sections and why)

## 2. Overall Description
### 2.1 Product perspective (context diagram if useful)
### 2.2 Product functions (high-level summary)
### 2.3 User characteristics (roles/actors)
### 2.4 Constraints, assumptions, and dependencies   <!-- CON-/ASM- IDs -->
### 2.5 Operating environment

## 3. Functional Requirements            <!-- usually the largest; FR- IDs, EARS -->
### 3.x <Feature / capability group>
   - FR-NNN  <EARS statement>   (priority; verification method)

## 4. Non-Functional / Quality Requirements   <!-- NFR- IDs, each measurable -->
### 4.1 Performance
### 4.2 Security and safety
### 4.3 Reliability and availability
### 4.4 Usability and accessibility
### 4.5 Maintainability and supportability
### 4.6 Portability and compatibility
### 4.7 Other quality attributes

## 5. External Interface Requirements    <!-- IFR- IDs -->
### 5.1 User interfaces
### 5.2 Hardware interfaces
### 5.3 Software interfaces (APIs, protocols, data formats)
### 5.4 Communications interfaces

## 6. Other Requirements (optional)
### 6.1 Legal / regulatory / compliance
### 6.2 Packaging, installation, deployment
### 6.3 Internationalization and localization
### 6.4 Data requirements (model, retention, residency)

## 7. Verification
### 7.1 Verification method per requirement (test / demo / inspection / analysis)
### 7.2 Acceptance criteria

## 8. Appendices
### 8.A Glossary
### 8.B Use cases / scenarios
### 8.C Traceability matrix
### 8.D Supporting diagrams
```

## Reference — traceability matrix

A table that lets each requirement be traced from its source to its verification.
At minimum:

| Req ID | Requirement (short) | Source (need / stakeholder / elicitation) | Priority | Verification method | Status |
|--------|---------------------|-------------------------------------------|----------|---------------------|--------|
| FR-001 | …                   | …                                         | Must     | Test                | Draft  |

Priorities use a clear scheme (e.g. MoSCoW: Must / Should / Could / Won't).

---

## Anti-patterns to avoid

- **Interviewing the user about facts that are in the code or the brief.** Explore
  first, always. (Rule 1.)
- **Emitting the SRS before approval.** A spec written before shared understanding
  just locks in the misunderstanding. (Rule 2.)
- **Vague, unverifiable requirements.** "The system should be fast/secure/easy."
  If you can't test it, it isn't a requirement yet.
- **Compound requirements.** One sentence smuggling two behaviors via "and."
  Split them so each has its own ID and verification.
- **Empty section scaffolding.** Don't ship headings with "N/A" under them; prune
  and note the omission in the overview.
- **Silent TBDs.** Unknowns become explicit assumptions or open questions, never
  invisible gaps.
- **Inventing numbers.** If the user said "fast" and you don't have a target,
  ask or flag it — don't fabricate "200 ms."
- **Hiding a fork.** Choosing between two valid scopes/designs without telling the
  user makes a decision that was theirs.

---

User SRS request:
$ARGUMENTS
