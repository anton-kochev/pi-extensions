# Application layer

The application layer owns use cases and the contracts it consumes. It
coordinates policy and boundaries; it should not become a second domain model or
a forwarding layer with no value.

## Use cases as cohesive handlers

A handler can be a class, function, endpoint collaborator, or framework-specific
unit already established by the repository. Its conceptual responsibilities are:

1. accept a use-case input independent of incidental transport details;
2. coordinate authentication context and authorization policy at the correct
   boundary;
3. load only the required state;
4. invoke the owner of business invariants;
5. establish or join the intended transaction;
6. persist and invoke external effects according to consistency requirements;
7. map the outcome to a stable application result.

A handler that repeatedly reads entity flags and decides how to mutate them may
be stealing domain behavior. A handler that only forwards a call may be an
unearned layer. Length is a clue, not a rule; responsibility and change reasons
matter.

## Ports are consumer-shaped

Define a port in the boundary that consumes it. Include only operations the use
case needs, with domain- or application-meaningful inputs and outputs.

Good candidates include external I/O, clocks, randomness, identity context,
message publication, and persistence boundaries that need isolation. Do not add
an interface for every handler, service, or deterministic class simply to satisfy
a pattern.

Persistence ports have legitimate alternatives:

- an application context contract can expose repository-supported query/set
  abstractions when coupling to those abstractions is an accepted trade-off;
- specific repositories can express aggregate access or named domain questions
  while hiding provider semantics;
- a vertical slice can own provider-aware queries directly when that layer is the
  intentional data-access boundary.

Choose one coherent approach per use case. Do not promise framework independence
while exposing framework types through the contract.

## Commands, queries, and CQRS

CQRS begins with recognizing different needs:

- commands change state and must preserve invariants, authorization, consistency,
  idempotency, and conflict behavior;
- queries read state and can project directly to stable result contracts without
  reconstructing an aggregate when no policy is being changed.

This separation can exist in one database and one process. Separate models,
stores, event sourcing, and asynchronous projections are additional decisions
that require measured need, operational ownership, lag semantics, and recovery
plans.

Do not send every operation through a command or query merely for naming
symmetry. Do not let a direct query bypass tenant, ownership, or authorization
filters.

## Dispatch choices

Direct dependency injection into a known handler is often sufficient. A mediator
can add dynamic dispatch, notification fan-out, or pipeline composition. A
message bus adds different semantics: durability, retries, ordering, scheduling,
or process boundaries.

For MediatR or another detected mediator, inspect the installed version, current
license/support terms, pipeline behaviors, registrations, and migration cost.
Preserve an existing compatible investment unless the task authorizes change.
For a new dependency, compare plain handlers and repository-native decorators
before requesting installation. Do not choose a bus merely to avoid a method
call.

## Cross-cutting concerns

Place a concern where its semantics are trustworthy:

| Concern | Typical owner |
| --- | --- |
| request shape and protocol validation | presentation/transport boundary |
| command shape independent of transport | application boundary |
| business invariants | domain owner |
| authentication | host/transport infrastructure |
| authorization and ownership | endpoint, application policy, or both according to threat model |
| transaction | application use case or adapter unit of work |
| logging and tracing | boundary/decorator with sensitive-data controls |
| retry | adapter or message infrastructure that understands idempotency |
| caching | query boundary with invalidation and tenant semantics |

Decorators, filters, middleware, pipeline behaviors, and explicit calls are all
possible mechanisms. Use the one supported by the repository and make ordering
observable where it changes correctness.

## Validation placement

Distinguish:

- malformed or missing transport input;
- application input that cannot be processed;
- authorization and ownership denial;
- domain state that rejects an otherwise valid request;
- infrastructure failure.

Do not move a business invariant into a validator that can be skipped by another
entry point. Do not query a database during “shape validation” without naming the
consistency and race implications. Recheck any state-dependent rule at the owner
that performs the mutation.

## Transactions and external effects

State what a transaction includes. A database commit and remote API call are not
atomically consistent merely because they appear in one handler. Select among:

- commit then invoke, accepting and handling a post-commit failure;
- invoke then commit, accepting compensation or duplicate-call risk;
- outbox/inbox and asynchronous processing;
- a provider-supported distributed mechanism when actually available and
  justified.

Define idempotency keys, duplicate handling, timeouts, cancellation, retry limits,
and observability for the chosen flow.

## Application tests

Test orchestration outcomes through the public use-case contract. Substitute real
ports, not internal implementation details. Verify relevant not-found,
unauthorized, conflict, cancellation, transaction, and external-failure paths.
Keep invariant combinatorics in domain tests rather than duplicating every domain
case through handlers.

When provider-aware query behavior matters, prefer an integration test over a
fragile mock of query-provider internals.
