# Testing architecture and avoiding cargo cult

Tests should prove behavior and load-bearing boundaries. They should not freeze
folder spelling, private call order, or a template's incidental structure.

## Discover test capabilities

Read test projects, central package configuration, runner settings, CI, fixtures,
containers, snapshots, analyzers, and nearby tests. Use the repository's
framework, assertion style, naming, and commands. Do not add a testing or mocking
package merely because it appears in an example.

Choose the narrowest useful feedback loop, then run broader checks justified by
the change. If restore, build, tests, containers, credentials, or external
services are unavailable, report that limitation rather than implying success.

## Proportional test strategy

| Boundary | Useful evidence |
| --- | --- |
| domain policy | fast unit tests of construction, invariants, transitions, outcomes, and meaningful facts |
| application use case | orchestration tests with substitutes at genuine ports |
| persistence adapter | real-provider tests for mapping, queries, constraints, transactions, concurrency, and migrations |
| external adapter | contract tests plus focused failure, timeout, cancellation, and idempotency cases |
| presentation | supported host integration tests for routing, binding, authorization, serialization, and error mapping |
| dependency rule | compiler/project-reference enforcement, analyzers, or focused architecture tests |
| deployed workflow | the smallest end-to-end checks needed for risks not covered below |

Avoid retesting all domain rules through every outer layer. Test each behavior at
the lowest boundary that owns it, then add a few integration paths proving the
wiring.

## Test-first sequence

For changed behavior, use pragmatic red-green-refactor:

1. list observable behaviors and risks;
2. add one focused test at the owning boundary;
3. run it and confirm an expected assertion, compile, import, or missing-symbol
   failure—not an unrelated harness failure;
4. implement the smallest coherent change;
5. rerun to green and refactor without changing behavior;
6. continue one behavior at a time;
7. run affected build, integration, architecture, and broader checks.

For an architecture policy that already holds, an intentional pin may pass at
first. Prove it can reject drift with a safe isolated or regeneratable mutation,
restore state, and rerun green. Never alter unrelated or user-authored work for a
mutation check.

## Dependency enforcement

Prefer enforcement that matches the boundary:

- project references and compiler errors for cross-project direction;
- analyzers when the repository already treats them as policy;
- architecture tests for namespace, naming, host exceptions, or conceptual
  layers sharing one assembly;
- repository-native metadata tests for declared project/package ownership.

When an architecture-test package is already present, follow its supported API.
When none is present, compare a small reflection/metadata test or build-graph
check before requesting a new dependency. Any package choice requires repository
compatibility and authorization.

Architecture tests should identify meaningful sets by assembly, marker type,
namespace convention, or explicit policy and emit a useful failure. Avoid rules
that bless every class suffix or force implementation details without an
architectural reason.

## Security and operational tests

Add cases according to risk:

- authorization, tenant isolation, ownership filters, and information disclosure;
- optimistic-concurrency conflicts and unsafe retries;
- duplicate messages, ordering, idempotency, poison handling, and outbox relay;
- cancellation and timeout propagation;
- partial failures around commit and external side effects;
- serialization and public-contract compatibility;
- migration compatibility, data backfill, and mixed-version rollout;
- telemetry that diagnoses failures without recording sensitive data.

Do not claim these are covered because an abstraction exists. Verify observable
behavior at the boundary where the risk occurs.

## Anti-pattern catalog

| Smell | Why it hurts | Smallest correction |
| --- | --- | --- |
| anemic entity plus state-changing handler conditionals | invariants can be bypassed and duplicated | move the rule to the state owner when the domain is genuinely behavioral |
| generic repository mirroring the ORM | loses capabilities without isolating semantics | use the established context boundary or a repository with named consumer needs |
| interface for every concrete type | adds navigation and mocking without a boundary | keep the concrete type unless substitution, ownership, or isolation is real |
| unconstrained query object crossing layers | leaks provider, lifetime, security, and execution | compose with the owner and return an explicit materialized contract |
| provider annotations or SDK types in a protected domain | reverses dependency direction | move translation/mapping to an adapter when isolation is required |
| controller, endpoint, consumer, or function with business decisions | creates entry-point-specific policy | delegate to a use case or domain owner |
| business rules hidden in validation middleware | another entry point can bypass them | keep shape checks at the boundary and invariants with their owner |
| domain events for ordinary local calls | obscures sequencing and failure | call local behavior directly; reserve events for meaningful facts |
| mediator used only to call a known handler | adds indirection without capability | inject/call directly unless pipeline or dynamic dispatch earns it |
| fake service layer forwarding every call | increases hop count, not separation | remove it or give it a real use-case responsibility |
| four projects for a trivial feature | scatters change without protecting policy | use a simple layer or vertical slice and extract only when complexity appears |
| framework-independent claim with framework types in ports | hides a real compatibility constraint | name and accept the coupling or define a narrower provider-neutral contract |
| in-process event dispatch described as reliable | process failure can lose delivery | state the guarantee or add an authorized durable mechanism |
| broad rewrite to “be clean” | risks behavior and compatibility for aesthetics | migrate one tested seam incrementally |

## Review questions

Before accepting a design or implementation, ask:

- Which concrete invariant, dependency, or deployment boundary earns each layer?
- Can a simpler slice preserve the same correctness and testability?
- Do compile-time dependencies point toward policy?
- Is business behavior owned once?
- Are transaction, concurrency, authorization, and external-failure semantics
  explicit?
- Are package and API choices supported by detected repository capabilities?
- Do tests prove behavior and boundary rules without freezing implementation?
- Is migration incremental and compatible?
- Were all reported verification commands actually run?
