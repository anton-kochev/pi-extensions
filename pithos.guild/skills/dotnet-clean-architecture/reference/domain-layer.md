# Domain layer

A domain layer earns its existence by owning policy that would otherwise be easy
to bypass or duplicate. Straightforward data shapes do not need artificial
aggregates, services, events, or wrappers.

## Rich behavior versus anemic data

An anemic model exposes state while handlers or services repeatedly decide how
that state may change. Move a decision onto the type that owns all information
needed to enforce it when doing so creates one reliable rule boundary.

Keep data-centric records data-centric when they carry no behavior. “Rich” does
not mean every property needs a method; it means important invariants have one
owner.

## Entities and invariants

An entity has continuity and identity. Protect valid state transitions through
construction and behavior rather than relying on every caller:

- restrict mutation to the narrowest supported access;
- use a factory when creation can fail or requires normalization;
- represent identity with a stronger type when it prevents real ambiguity;
- reject invalid transitions before mutating state;
- make concurrency assumptions part of the contract when persisted copies can
  race.

Framework materialization concessions can be acceptable when they remain narrow
and cannot be misused by ordinary callers. Detect serializer and ORM requirements
before selecting constructor or property patterns.

## Aggregates and consistency

An aggregate is a consistency boundary, not a synonym for an object graph.
Define:

- the invariant that must be atomic;
- the root through which mutation occurs;
- which references cross the boundary by identity;
- transaction scope and optimistic-concurrency behavior;
- how conflicts are surfaced and retried, if retry is safe.

Prefer small aggregates. Coordinating several aggregates in one transaction may
be correct for a local relational boundary, but it should follow the required
consistency model rather than a blanket rule. Use eventual consistency only when
product behavior tolerates it.

## Value objects

Use a value object where equality, normalization, units, validation, or
composition carries domain meaning. Creation should make the valid/invalid
outcome explicit and equality should match the concept.

A value object can be a class, record, or struct depending on detected language
support and required identity, allocation, default-value, serialization, ORM,
and interop behavior. Do not assume a syntax form from an illustrative example.

## Encapsulated collections

Do not expose a mutable collection when callers could bypass ordering,
uniqueness, cardinality, or state-transition rules. Keep mutable storage private,
expose a read-only view compatible with repository conventions, and mutate it
through domain behavior.

Read-only typing alone may not prevent mutation if the backing collection escapes.
Choose copying, wrappers, immutable collections, or controlled enumeration
according to performance and safety needs.

## Domain services

A domain service can own a rule that naturally spans multiple domain concepts and
belongs to none of them. It should remain policy-focused and free of transport or
persistence mechanics.

If most behavior moves into services that inspect and update public entity
properties, the model is becoming anemic. If a service primarily calls I/O, it is
probably an application use case or adapter instead.

## Expected outcomes and exceptions

Follow the repository's established error contract:

- expected business outcomes should be explicit through a result, error, union,
  or similarly visible contract;
- programming errors, violated internal invariants, and genuinely exceptional
  boundary failures can use specific exceptions;
- do not catch an exception merely to hide it or turn every failure into the same
  sentinel;
- translate failures once at a boundary that can add a stable transport or user
  contract.

Stable error identifiers matter when clients, telemetry, or workflows depend on
them. Keep sensitive data out of error messages and logs.

## Domain events

A domain event states a meaningful fact in the domain language. The entity or
aggregate can record the fact without knowing consumers, but the architecture
must define what happens next.

Ask:

- Is dispatch before, inside, or after the persistence transaction?
- Can delivery be lost after commit or duplicated after retry?
- Is ordering scoped per aggregate, stream, tenant, or not guaranteed?
- Are handlers in-process, durable, or remote?
- How are failures observed, retried, dead-lettered, or compensated?
- Which consumers must be idempotent?

In-process dispatch after save avoids reacting to uncommitted state but does not
make delivery durable. If publication must be atomic with state persistence, use
a transactional outbox or an existing equivalent and define relay ownership.
Avoid domain events for ordinary same-aggregate method calls.

## Persistence concessions

Keep provider attributes, configuration types, lazy-loading mechanics, and SDK
contracts outside the domain when isolation is an explicit boundary. Mapping in
an adapter may use constructors, converters, field access, or complex/owned
mapping only when supported by the detected provider version.

A domain package can depend on carefully selected foundational libraries when the
repository explicitly accepts that dependency and it does not point outward.
“Zero packages” is a possible policy, not a universal definition of a domain.

## Domain test behaviors

Domain tests should usually construct policy objects directly and assert
observable state, outcomes, and meaningful recorded events without infrastructure
mocks. Cover invalid construction, allowed and rejected transitions, boundary
values, collection invariants, and relevant concurrency semantics. A difficult
pure-domain test is evidence that the model may hide infrastructure or have an
unclear owner.
