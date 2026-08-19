---
name: dotnet-clean-architecture
description: >-
  Repository-aware Clean Architecture guidance for C# and .NET systems. Use
  when structuring or reviewing solution boundaries, deciding between clean,
  layered, vertical-slice, or hybrid architecture, placing domain and use-case
  behavior, defining ports and adapters, evaluating CQRS or mediator choices,
  designing persistence boundaries, or testing dependency rules. Inspect the
  repository first and apply only the architecture and APIs its target
  frameworks, language settings, packages, domain complexity, and conventions
  support.
---

# Clean Architecture for .NET

Use Clean Architecture to protect business policy from delivery, persistence,
and integration details—not to maximize projects, interfaces, or indirection.
The dependency rule is valuable; any particular folder tree, mediator,
repository abstraction, ORM, or four-project template is optional.

This skill supplies repository-connected guidance. It does not authorize a
migration, dependency addition, public-contract break, or broad restructuring.
Preserve a healthy existing architecture unless the user asks to change it and
the trade-offs are explicit.

## Eligibility and repository discovery

Before applying this skill, establish that the task is about substantive,
relevant .NET or C# code connected to the repository. Inspect evidence such as
`.sln`, `.slnx`, `.csproj`, `Directory.Build.props`, `Directory.Build.targets`,
`Directory.Packages.props`, `global.json`, project references, package and lock
configuration, production source, and tests. An incidental snippet, generated
file, vendored sample, or package name is not sufficient. If neither connected
code nor an explicit repository-scoped request to create a .NET solution exists,
stop and refuse generic consulting.

Detect rather than assume:

- `TargetFramework`/`TargetFrameworks`, SDK selection, runtime identifiers, and
  deployment targets;
- `LangVersion`, `Nullable`, implicit usings, analyzers, warnings policy, and
  formatting conventions;
- project references, package versions, central package management, lockfiles,
  and restore conventions;
- hosting model, composition roots, dependency injection, persistence provider,
  migrations, transport, messaging, background work, and external adapters;
- test projects, test framework, test runner and commands, fixtures, architecture
  tests, integration infrastructure, and CI expectations.

Trace actual dependencies and behavior. Do not infer architecture from folder or
directory names alone. Classify nearby patterns as healthy practice, harmless
local convention, questionable design, or anti-pattern. Preserve sound
architecture and healthy boundaries unless an authorized change requires a
focused departure.

## Role-aware use

When a read-only architect uses this skill, remain at architecture altitude:
produce decisions, responsibilities, dependency direction, contracts, test
behaviors, risks, and a recipient-neutral handoff; do not provide function bodies
or claim implementation. When a coder uses it, implementation and edits must
stay within the approved scope, follow supported repository capabilities, add or
adjust tests where behavior changes, and verify with commands actually run.

The skill does not weaken either role's tool boundary. If architecture requires a
material product, compatibility, data, deployment, or migration trade-off that
the task did not authorize, return `Blocked` with the decision required.

## Choose the smallest architecture that earns its cost

Choose from evidence: domain complexity and invariants, rate and shape of change,
team size and ownership, expected lifetime, integration count, operational and
deployment boundaries, and compatibility obligations.

| Situation | Usually start with |
| --- | --- |
| Straightforward CRUD or a small service with little business policy | a simple layered design or cohesive vertical slice |
| Features change independently and locality matters most | vertical slices grouped by use case |
| Complex, long-lived policy needs isolation from frameworks and I/O | Clean Architecture boundaries around that policy |
| Mostly simple behavior with a few complex invariants | a hybrid: direct simple paths plus a protected domain core where needed |
| Independently deployed components | boundaries aligned to ownership, consistency, and deployment—not folders alone |

A four-project layout is an example or option, not a requirement or default
mandate. Existing solutions may merge layers, split adapters, use modules, or put
the composition root in a dedicated host. Judge dependency direction and
ownership, not project count.

Before proposing a new layer or abstraction, answer what invariant it protects,
which dependency it isolates, or which test seam it enables. If there is no
concrete answer, omit it. Prefer incremental extraction over a flag-day rewrite.

See [reference/solution-structure.md](reference/solution-structure.md) for layout
options, dependency inspection, composition roots, and migration strategy.

## Dependency rule and responsibilities

In a Clean Architecture boundary, source dependencies point inward toward
business policy. Runtime calls can flow outward through interfaces; source
ownership still points toward the consumer.

| Responsibility | Owns | Must avoid |
| --- | --- | --- |
| Domain or policy core | entities, aggregates, value objects, invariants, domain errors and meaningful facts | transport, database provider, UI, or adapter mechanics |
| Application or use cases | orchestration, authorization policy coordination, transaction intent, ports, use-case contracts | persistence-provider details and transport-specific behavior unless the established architecture deliberately accepts that coupling |
| Infrastructure adapters | persistence mappings, external SDKs, files, queues, clocks, email, payment and other port implementations | presentation ownership or new business policy |
| Presentation or transport | request parsing, authentication context, boundary validation, result translation and response contracts | direct mutation of domain state or hidden persistence logic |
| Composition root | concrete registrations, lifetimes, configuration and host wiring | business behavior |

A port or abstraction is owned by the consumer that needs isolation. Shape it
around that consumer's use case, not the adapter's entire API. Introduce an
interface for a real boundary, substitution, ownership, or isolation need—not an
interface for every class or each handler.

Locate the composition root from repository evidence. It may be a web host,
worker, function host, executable, module bootstrapper, or dedicated project.
Outer projects may be referenced there for registration without making their
types valid dependencies everywhere else.

Dependency inversion does not mean dependency proliferation. A framework type in
an inner layer can be an intentional trade-off when the repository accepts it;
name the coupling, test the boundary, and do not falsely call it framework
independent.

## Domain and application behavior

Use tactical domain modeling only where behavior is genuinely complex:

- Put each invariant with the entity, aggregate, or policy owner that has the
  state needed to enforce it. Handlers coordinate; they should not duplicate a
  business rule by reading flags and mutating properties.
- Keep aggregate boundaries aligned to consistency and transaction requirements,
  not object graphs. Avoid loading or atomically updating unrelated aggregates
  without a demonstrated consistency need.
- Use a value object when identity, equality, validation, units, or primitive
  ambiguity matters. Do not wrap every scalar merely for style.
- Encapsulate a mutable collection behind a read-only view and route mutation
  through behavior that enforces its rules.
- Use a domain service only for policy spanning concepts with no natural entity
  owner. A growing service layer can signal an anemic model.
- Model expected business failures with the repository's established result,
  error, or discriminated outcome contract. Reserve exceptions for exceptional
  failures and broken programming invariants; translate them at a trustworthy
  boundary.

A use-case handler orchestrates: validate boundary shape, authorize at the
appropriate trustworthy boundary, load required state, call the business-rule
owner, persist within an explicit transaction boundary, and map the outcome.
CQRS means command and query paths may differ; it does not require a mediator,
separate stores, event sourcing, or a package.

Domain events represent meaningful facts, not an indirect method-call mechanism.
Specify transaction timing, delivery and ordering guarantees, duplicate handling
and idempotency, failure behavior, and whether consumers are in-process or
durable. Dispatch after persistence avoids publishing an uncommitted fact but can
still fail after the state commits. When atomic durable publication matters,
consider a transactional outbox or the repository's equivalent rather than
claiming in-process dispatch is reliable.

See [reference/domain-layer.md](reference/domain-layer.md) and
[reference/application-layer.md](reference/application-layer.md).

## Persistence and external boundaries

Apply EF Core guidance only when EF Core is present or explicitly selected.
Inspect the actual provider and version, mappings, migration conventions,
transaction strategy, execution retries, optimistic concurrency, query behavior,
and test setup before recommending APIs.

`DbContext` and its sets already provide data-access and unit-of-work behavior. A
generic repository that merely repeats those operations often reduces capability
without creating a real boundary. Prefer the established context port, or a
specific repository when it names a genuine aggregate access need or domain
question. Do not introduce both styles across one use case without a reason.

Do not leak an unconstrained `IQueryable` across an ownership or lifetime
boundary. Keep query composition where provider semantics, lifetime, security
filters, tracking, paging, and execution are owned; return a materialized result,
DTO, page, or explicit query result at the boundary. Inside one intentionally
provider-aware layer, query composition can remain local.

For every external adapter, define timeout, retry, cancellation, idempotency,
partial-failure, observability, and ownership where relevant. Authorization and
tenant or ownership filters must remain at trustworthy boundaries. Keep secrets
and sensitive data out of source, logs, errors, snapshots, and domain events.
Retries must be bounded and safe for the operation.

Presentation translates transport contracts to use cases and outcomes back to
stable responses. Do not expose persistence entities or domain internals merely
to avoid mapping. Preserve source, binary, serialization, and persisted-data
compatibility where those obligations exist.

See
[reference/infrastructure-and-presentation.md](reference/infrastructure-and-presentation.md).

## Mediators, CQRS, and package choices

A mediator is an implementation choice, not an architecture. Before retaining or
adding MediatR, another mediator, a message bus, decorator library, validation
library, architecture-test package, or object mapper:

1. inspect the existing dependency and its version, current license and support
   terms, repository compatibility, and actual features in use;
2. compare direct dependency injection and plain handlers with the operational
   capabilities genuinely required, such as durable messaging, retries,
   scheduling, sagas, or an outbox;
3. obtain authorization before adding, replacing, pinning, or upgrading a
   dependency; and
4. include migration, rollout, maintenance, and test costs in the decision.

Do not repeat time-sensitive package licensing or maintenance claims as timeless
facts. Verify them from the package's current authoritative sources when they are
material.

## Test-first architecture and verification

Inspect the repository's test framework, test runner, test commands, naming,
fixtures, assertion style, and CI before prescribing tests. Drive changed
behavior with the smallest useful red-green-refactor loop when implementation is
in scope. Architecture-only work specifies observable tests in implementation
order but remains read-only.

A proportional strategy commonly includes:

- domain unit tests for invariant-rich policy without infrastructure mocks;
- application or use-case tests around orchestration and real ports;
- persistence, adapter, endpoint, contract, and integration tests at actual
  boundaries;
- architecture or dependency tests for rules that project references, analyzers,
  or compiler boundaries do not already enforce.

Use an existing architecture-test tool when present. Add a package or dependency
only when approved and when a compiler check, project-reference rule, analyzer,
or small repository-native test cannot enforce the requirement. Do not prescribe
one testing library universally.

Test business behavior through public contracts, not private methods or folder
names. Include cancellation, authorization, concurrency, transaction, retry,
serialization, migration, and failure cases only where the risk exists. Never
claim a test, build, restore, format, migration, or verification step passed
unless it was actually run; report unavailable or failing checks truthfully.

See
[reference/testing-and-antipatterns.md](reference/testing-and-antipatterns.md).

## Working sequence

1. Establish eligibility and read repository capabilities.
2. State the current boundaries, dependency graph, facts, and unresolved
   assumptions.
3. Define observable behavior, invariants, compatibility, consistency, security,
   and operational constraints.
4. Compare the smallest credible architecture options, including leaving the
   current structure unchanged.
5. Select boundaries and ownership with explicit rationale; identify rejected
   alternatives briefly.
6. Specify tests and incremental implementation or migration slices.
7. Verify only through supported repository commands and report results
   truthfully.
8. Review the final proposal or diff for accidental ceremony, outward
   dependencies, hidden coupling, and unauthorized trade-offs.

Examples in the reference files are illustrative shapes. Adapt every example to
the repository's supported language, framework, nullable, package, and hosting
capabilities; do not paste syntax or APIs merely because they appear there.
