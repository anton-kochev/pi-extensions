# Infrastructure and presentation

Outer boundaries translate between application-owned contracts and concrete
providers, protocols, hosts, and deployment environments. They can know inward;
inner policy must not know their implementation details unless the architecture
explicitly accepts that coupling.

## Persistence adapters

When the repository uses EF Core, inspect its actual provider and version,
context lifetime, mappings, migrations, conventions, interceptors, execution
strategy, transaction use, and concurrency tokens. Select APIs from that evidence.
Do not assume an example from another target framework compiles here.

Keep provider mapping in the persistence adapter when domain isolation is a goal.
Configuration may cover strongly typed identifiers, value objects, backing fields,
owned/complex values, conversions, relationships, indexes, constraints, and
concurrency. Database constraints should reinforce critical invariants where
possible; application checks alone cannot prevent every race.

Schema changes require migration review, forward/backward compatibility, data
backfill, deployment ordering, lock/downtime risk, and rollback or roll-forward
strategy. Do not generate a migration when schema change is not in scope.

## Repository decisions

A context already supplies query, identity-map, change-tracking, and unit-of-work
behavior. A generic repository that repeats add/get/update/delete often hides
useful provider features while leaking them through escape hatches.

A specific repository is useful when it owns a stable aggregate-loading pattern,
encapsulates security or tenancy, or names a genuine domain question. Its methods
should describe consumer needs rather than mirror every provider operation.

Query-side projections can bypass aggregate repositories when they are read-only,
bounded, authorized, and mapped directly to a response contract. Keep tracking
intentional and results bounded.

## Query ownership

An `IQueryable` carries deferred execution, provider semantics, context lifetime,
security-filter, and performance behavior. Do not return it across an ownership
boundary where callers cannot see those obligations.

Compose filters, sorting, paging, projections, and security predicates within the
provider-aware owner. Return a materialized list, page, stream with explicit
lifetime, DTO, or scalar result. Review generated query shape, indexes, N+1 risk,
over-fetching, client evaluation, and cancellation where relevant.

## External adapters

For HTTP, queues, email, payments, blob storage, filesystem, clocks, identity
providers, and other external systems:

- keep SDK and wire types at the adapter;
- translate to the consumer-owned port contract;
- validate configuration at a supported lifecycle boundary;
- set bounded timeouts and propagate cancellation;
- retry only transient, idempotent operations with limits and jitter when the
  repository supports it;
- preserve exception causality while translating provider-specific failures;
- emit structured telemetry without secrets or sensitive payloads;
- define rate limiting, circuit breaking, and backpressure only where needed.

Ownership matters: do not dispose an injected client or resource the container
owns. Do dispose locally owned synchronous or asynchronous resources correctly.

## Event dispatch and durability

Collecting a domain event and invoking an in-process handler is not durable
messaging. Make the guarantee explicit:

- before-commit dispatch can participate in local state changes but may execute
  for a transaction that later fails;
- after-commit dispatch describes committed state but can be lost if the process
  fails between commit and dispatch;
- an outbox can atomically store state and a publication record, but requires a
  relay, idempotent consumers, retention, ordering policy, monitoring, and poison
  handling.

Use existing message infrastructure when present and compatible. Do not introduce
an outbox for a harmless in-process reaction with no durability requirement.

## Presentation as adapter

An endpoint, controller, function trigger, consumer, CLI command, or UI adapter
should:

1. parse and normalize transport input;
2. establish authenticated identity and trusted context;
3. perform protocol-level validation and invoke authorization policy;
4. call one cohesive use case;
5. map outcomes to a stable transport contract;
6. preserve cancellation and observability.

Do not expose persistence entities or mutable domain objects as response models.
That couples serialization, versioning, lazy loading, security filtering, and
internal state. Reuse an application result only when it deliberately matches the
public contract; otherwise map at the edge.

Map errors consistently, including validation, authentication, authorization,
not-found, conflict/concurrency, throttling, cancellation, and unexpected failure.
Do not reveal stack traces, internal identifiers, secrets, or personal data.

## Composition and lifetimes

The composition root selects adapters and lifetimes. Verify scoped dependencies
are not captured by singletons, background work creates supported scopes, and
concurrent services do not share unsafe mutable state. Configuration and feature
selection belong here; business branching does not.

Health checks should distinguish liveness from readiness and avoid leaking
secrets. Startup checks must not create an outage by requiring optional remote
systems unless that dependency is genuinely required for readiness.

## Integration verification

Test persistence mappings, constraints, translations, transactions, concurrency,
and migrations against the real provider or the repository's closest supported
substitute. In-memory doubles often fail to reproduce relational and provider
behavior.

Test presentation through the supported host fixture where routing, binding,
filters, middleware, serialization, authentication, and dependency injection are
part of the behavior. Replace only true external boundaries and keep security
controls enabled unless the test explicitly owns an equivalent fixture.
