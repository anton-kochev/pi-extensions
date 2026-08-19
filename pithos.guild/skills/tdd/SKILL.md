---
name: tdd
description: >-
  A test-first workflow for writing or changing code: list the behaviors you
  want, drive each one into existence through the red-green-refactor loop, and
  let the tests shape the design. Use this skill when the user wants to build a
  feature, fix a bug, or change non-trivial behavior test-first — triggers
  include "TDD", "test-driven", "test first", "write tests first",
  "red-green-refactor", "drive this with tests", or a request to implement
  well-tested logic (parsers, algorithms, business rules, state machines, API
  handlers) where jumping straight to code would risk untested or over-built
  work. Apply it proactively when a task introduces non-trivial logic, even if
  the user does not explicitly ask for TDD. This is the tech-agnostic methodology
  layer — the loop is identical
  whether the runner is pytest, JUnit, Jest, RSpec, or `go test`; pair it with a
  stack-specific skill or agent for tooling and conventions.
---

# Test-Driven Development

TDD is not a testing technique; it is a *design* technique that happens to leave
tests behind. The point, as Kent Beck framed it when he formalized the practice
in *Test-Driven Development: By Example*, is "clean code that works" — and a way
of managing fear while you get there. You write a test that says what the code
should do *before* the code exists, watch it fail, make it pass with the least
code possible, then clean up while the test holds the behavior steady. The tests
are scaffolding for design and a safety net for change; good design is their
by-product, not their goal.

The discipline is deliberately tech- and language-agnostic. The *loop* is always
the same. Only the tooling layer changes — the runner, the assertion library, the
naming convention. Everything in this skill applies whether you're in pytest,
JUnit, Jest, RSpec, `go test`, ExUnit, or a hand-rolled harness.

## When to use TDD

Use TDD proactively for non-trivial logic: parsers, algorithms, business rules,
state transitions, validation, branching error behavior, API handlers, and bug
fixes where a regression can be reproduced. Do not wait for the user to say
"test-first." If a test can clarify a behavioral decision or shape a public
interface before the implementation hardens, start with the loop.

Scale the ceremony to the risk. A small pure rule may need one narrow unit test;
a boundary-spanning behavior may need an integration test. The objective is the
shortest useful feedback loop, not imposing a particular test layer.

## Repository and tool discovery

Before writing the first test, inspect the test runner, test commands, manifests,
configuration, and nearby test conventions already present in the repository.
Identify the narrowest command that exercises the behavior and the broader
checks expected by the project. Reuse its assertion style, fixture strategy, and
file layout rather than introducing a parallel harness or assuming a favorite
framework.

Use the available tools and adapt to the environment's capabilities. Read and
search before editing; use the repository's supported runner, compiler, build,
or framework diagnostics; and do not add a dependency merely to perform the
ritual. If the environment cannot execute a relevant check, keep the change
verifiable by the strongest available mechanism and report the limitation
truthfully.

## The two rules that matter most

**Rule 1 — Never write production code except to make a failing test pass.** A
test must exist and must be failing (red) before you write the code that
satisfies it. This is what makes the design *driven* by tests rather than merely
*covered* by them. Writing the code first and adding a test afterward is a valid
practice, but it is not TDD and it forfeits TDD's main benefit: the test gets to
shape the interface before the implementation locks it in.

**Rule 2 — The test must fail for the right reason before you make it pass.** Run
the test and watch it go red. An assertion failure is not the only valid red: an
expected missing symbol, type, compile, or import error counts as a valid failure
when the test deliberately names an API that does not exist yet. An unrelated
harness, setup, dependency, environment, or configuration failure does not count;
repair that problem and rerun until the failure demonstrates the missing behavior.
For a test driving new behavior, passing the moment you write it is also telling
you nothing. An intentional existing-state pin is the exception: it may pass on
arrival, but a safe controlled red must then prove that it detects drift. Seeing
an *expected* failure proves the test can detect the absence or violation of the
behavior and is not a decoration that can never fail.

## Posture: small steps, fast feedback

Keep each trip around the loop tiny — minutes, not hours. The goal is not the
fewest cycles; it's a steady rhythm of small, verified increments so that when
something breaks you know it was the last thing you did. Run the tests
constantly. Keep the suite fast (a fast-cycle unit suite should run in seconds,
not minutes) so that running it never feels like a tax. If a step feels big or
scary, take a smaller one.

---

## The loop

### Phase 0 — Write the test list (before you touch code)

Start by writing down, in plain language, the behaviors you want to cover: the
happy path, the edge cases, the error cases, the boundaries. This is Kent Beck's
first step in "Canon TDD," and it is the analogue of planning: it lets you think
about *what* the code should do separately from *how* to make any single case
pass. Keep the list visible (a scratch file, a comment block, a TODO). You will
add to it as you discover new cases mid-implementation, and cross items off as
you go. You are done when the list is empty.

Do **not** turn the whole list into tests at once. Pick one.

### Phase 1 — Red: write one failing test

Turn exactly **one** item from the list into a concrete, runnable test. Write it
as if the production code you wish existed already exists — call the function,
construct the object, invoke the endpoint the way you'd *want* to. This is the
moment the test acts as the first consumer of your design, so let it push you
toward an interface that's pleasant to use.

Then run it and confirm it fails for the right reason. Write no more of the test
than is sufficient to fail. An expected compile, import, type, or missing-symbol
failure at the deliberately absent production boundary is red and is often the
right place to stop and make the API exist. A broken test command, unavailable
dependency, malformed fixture, or other unrelated harness/setup failure is not
red; fix the test infrastructure without implementing the behavior, then run the
test again and observe the expected failure.

A good test at this phase:
- exercises **one** behavior, with a name that states that behavior
- asserts on the **observable result**, not on how the result is computed
- uses the **minimum** setup and data needed to show the behavior — no more

### Phase 2 — Green: make it pass with the least code possible

Write the simplest thing that turns the bar green. Correctness is the *only*
criterion here; elegance is explicitly not. You are allowed to commit sins —
hardcode a value, ignore cases not yet tested — because the next tests and the
refactor step will clean up after you. Getting to green fast keeps you in rhythm
and gives you a working safety net before you start improving anything.

When you're not sure what to type, escalate through these three gears (Beck's
"green-bar patterns"), smallest step first:

1. **Obvious Implementation** — if the real code is obvious and you're confident,
   just write it. Don't fake it for the sake of ceremony.
2. **Fake It** — return a hardcoded constant that satisfies the test, then
   generalize on later cycles by replacing constants with variables. Useful when
   the real implementation isn't yet clear.
3. **Triangulate** — when you can't see the general rule, add a *second* test with
   different data. Two concrete examples force you to generalize: the
   implementation that satisfies both is usually the real one.

Shift between gears by confidence: cruise in Obvious Implementation, downshift to
Fake It / Triangulate the moment you get a surprising red bar, shift back up when
confidence returns.

### Phase 3 — Refactor: improve structure, change no behavior

With every test green, now improve the code — remove the duplication you just
created (especially duplication *between the test and the code*, which is where
design pressure lives), clarify names, extract methods, introduce the abstraction
the cases are pointing at. The tests are your net: they let you reshape fearlessly
because they'll tell you the instant behavior shifts.

Two non-negotiables for this phase:
- **Refactoring means changing structure without changing behavior.** If you're
  adding or altering behavior, you're not refactoring — go back to Phase 1 and
  write a test for it first.
- **You don't write new tests to refactor.** The behavior is already specified;
  the existing green tests are what make the refactor safe. Run them after every
  change.

This is the phase beginners skip, and skipping it is the single most common way
TDD fails to pay off — without it the suite still grows but the design rots, and
you've paid for tests without collecting the design dividend.

### Phase 4 — Repeat

Cross the item off the list, pick the next one, and go back to Phase 1. Add newly
discovered cases to the list as you find them. Loop until the list is empty and
the design feels right.

---

## A worked micro-example (language-agnostic)

Implementing a `fizzbuzz(n)` rule, in pseudocode:

```
Test list: returns "1" for 1 · "Fizz" for 3 · "Buzz" for 5 · "FizzBuzz" for 15

RED:    assert fizzbuzz(3) == "Fizz"          # fails: fizzbuzz doesn't exist
GREEN:  def fizzbuzz(n): return "Fizz"         # Fake It — hardcoded, passes
RED:    assert fizzbuzz(1) == "1"              # fails: still returns "Fizz"
GREEN:  return "Fizz" if n % 3 == 0 else str(n) # Triangulate forced a real rule
REFACTOR: (nothing to clean yet) → next list item: Buzz, then FizzBuzz...
```

Notice the tests asserted on *return values* (behavior), never on how the
branching was structured (implementation). That's what lets the refactor step
move freely.

---

## Three Laws version (for tight discipline)

Robert C. Martin compresses the loop into three rules that, followed literally,
*force* the rhythm:

1. Write production code only to make a failing test pass.
2. Write no more of a test than is sufficient to fail (compile failures count).
3. Write no more production code than is sufficient to pass the one failing test.

Treat these as training wheels in the Shu-Ha-Ri sense: follow them strictly while
building the instinct, then flex once the rhythm is internal. Even Beck doesn't
follow them rigidly — the laws exist to build the reflex, not to be obeyed
forever.

---

## Test behavior, not implementation

This is the rule that separates tests that *enable* change from tests that
*obstruct* it. Implementation details change constantly; observable behavior is
stable. Ask "what should this do?" — not "how does it do it?"

- Assert on outputs, returned values, raised errors, and visible state changes —
  not on private internals, call order, or intermediate steps that a refactor
  could legitimately rewrite.
- Assert on exactly what the behavior requires and no more. A test that checks an
  entire object when it cares about one field will break every time an unrelated
  field is added — a fragile test that cries wolf and trains people to ignore it.
- **Mock at the boundaries, not inside them.** Replace genuinely external
  dependencies — network APIs, databases, the clock, the filesystem, third-party
  services — with test doubles so tests stay fast and deterministic. But exercise
  your *own* internal logic for real; mocking your own collaborators couples the
  test to the structure and turns it into a change-detector instead of a
  behavior-check. (There's a long-running classicist-vs-mockist debate here; the
  pragmatic default that works across most codebases is "fake the edges, run the
  middle.")

**Listen to your tests.** They are the first user of your code. If a test needs a
hundred lines of setup, or you can't test a behavior without reaching into
internals, or you can't tell what a test is for — that pain is a design signal,
not a testing inconvenience. Hard to test usually means hard to use. Fix the
design, don't contort the test.

---

## Tests that pin instead of drive

A driving test states desired behavior before the production implementation,
uses the interface a caller should want, and goes red because that behavior does
not exist. Tests written after production code can instead pin the existing
implementation: they often pass on arrival, mirror its branches or data shape,
and preserve whatever was built. Such a test may increase coverage but supplies
no evidence that it can detect the behavior's absence or shape the design.

A different, intentional pin protects something that is currently true: an
invariant, deny-list, policy, configuration, generated catalog, or exact contract
that already works. It should pass when written because no new behavior is being
driven. Rule 2 still applies, so prove the pin can object rather than merely show
that it matches. Manufacture that red with the smallest controlled mutation the
test is meant to catch, run the focused test, inspect its diagnostic, then revert
or restore the mutation and rerun to green. A green match proves the test can
read the state; only the controlled red proves it can reject drift.

Report pin evidence as a compact table, not an assurance:

| Controlled mutation | Test that went red | Failure message |
| --- | --- | --- |
| the smallest representative drift | the focused command or case | the diagnostic that identified the drift |

Perform mutation testing only when it is safe. Prefer a regeneratable artifact,
an isolated temporary copy or fixture, or your own uncommitted line, with cleanup
that also runs after failure or interruption. Verify the repository state was
restored afterward. Never disable or weaken a control that is actively protecting
repository or user state merely to prove another control watches it; use an
equivalent isolated case instead. Do not alter user-authored or unrelated changes.

Make the expected value resistant to blind replacement. Compare semantic sets or
structures rather than serialized strings when order is irrelevant, and keep
allowlists or policy entries in a table with a written justification for each
entry. That makes legitimate updates explicit and prevents a failing expectation
from being "fixed" by copying the observed state over it without review.

Characterization tests are another deliberate form of pinning. Around legacy
code, capture current observable behavior to establish a safety net before a
refactor. Avoid blessing every incidental output, private call, or oversized
snapshot, and record known quirks so a temporary characterization does not
silently become a permanent product promise. Once the baseline is protected,
drive each new or changed behavior test-first. Regression tests follow the same
rule: reproduce the bug as a focused failing test before applying the fix.

## When to flex (and when to skip)

TDD is a strong default for non-trivial logic, but it is a tool, not a religion.
Apply judgment:

- **Spikes and exploration.** When you genuinely don't yet know the shape of the
  API or whether an approach is viable, it's fine to spike first to learn, *throw
  the spike away*, and then TDD the real thing with what you learned. Writing
  tests against an interface you're still discovering is wasted motion.
- **Throwaway and prototype code** that won't be maintained doesn't need the
  ceremony.
- **Trivial code** (a plain getter, a config constant) gains little from a test
  written first.
- **Metadata, declarations, configuration, generated, and compiler-only work.**
  A runtime red-green cycle may be artificial or impossible. For a mechanical
  metadata or configuration edit, use the repository's schema, parser, lint, or
  build check. For declarations and compiler-only contracts, prefer a focused
  compile fixture when it adds value. Change generated output through its source
  or generator and verify regeneration rather than hand-testing generated text.
  Do not invent runtime production code solely to manufacture a red phase.
- **Legacy code with no tests.** Don't start with greenfield TDD — start with
  *characterization (pinning) tests* that capture current behavior as-is, giving
  you a net, *then* refactor and drive new behavior test-first.
- **Coverage is a diagnostic, not a target.** Chase meaningful coverage of the
  parts that matter and change often; don't write hollow tests to hit a 100%
  number. High coverage with behavior-coupled tests is worse than honest gaps.

State the call out loud when you deviate: "this is a spike, I'll throw it away and
TDD the real version" is a healthy thing to say; silently abandoning the loop
because a step got hard is not.

---

## Verification and reporting

Verification is part of the loop, not a retrospective claim. Record the focused
command and its expected red result, rerun that same command to green, then run
the relevant broader test, type-check, lint, or build commands justified by the
change. Distinguish a behavioral red from unrelated infrastructure failures, and
do not hide a failing broader check just because the narrow test passes.

Never claim or report that tests pass, the suite is green, or verification
succeeded unless you actually ran the stated command and observed that outcome.
Report each failure with its useful diagnostic. If a check was unavailable,
unsafe to run, or not run, say so explicitly and explain the limitation instead
of implying success. Separate failures introduced by the change from pre-existing
or environmental failures when the evidence supports that distinction.

## Anti-patterns to avoid

- **Skipping the refactor.** The most common failure. Green is not done; green is
  permission to clean up. The design payoff lives in Phase 3.
- **Writing the code first, test after.** That's test-*after* development. It
  still gives you coverage but forfeits the design feedback that is TDD's whole
  point.
- **Tests that can't fail.** If you never saw a test red for the right reason,
  you don't know that it can object. Assertion-free tests and driving tests that
  pass on arrival are decorations. An intentional existing-state pin may pass
  initially, but it still needs a safe controlled red before it is trustworthy.
- **Asserting on implementation.** Coupling tests to private methods, call
  sequences, or full-object snapshots makes every refactor break the suite, so
  people stop refactoring — the exact opposite of the goal.
- **Giant steps.** Writing ten tests or a whole module before running anything.
  When it breaks you've lost the "it was the last thing I did" guarantee. Baby
  steps.
- **Excessive setup / the giant test.** A test that needs a mountain of
  scaffolding or asserts a dozen things is telling you the production code is
  doing too much. Listen to it.
- **Over-mocking your own code.** Mocking internal collaborators turns
  behavior-tests into structure-tests that break on every refactor.
- **Coverage-chasing.** Optimizing a percentage instead of testing the behaviors
  that carry risk.
