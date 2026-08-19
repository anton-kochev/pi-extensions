# Solution structure and dependency direction

Use structure to make ownership and dependency rules visible. Do not start by
copying a template; start by mapping the repository.

## Inspect the current solution

Build an evidence table before proposing changes:

| Evidence | What it answers |
| --- | --- |
| solution and project files | project boundaries, target frameworks and build graph |
| central build/package files and SDK selection | shared policy, analyzers, package ownership and compatibility |
| project references and namespaces | actual compile-time dependency direction |
| host entry points and registrations | composition roots and runtime ownership |
| source and tests | where behavior really lives and how boundaries are exercised |
| deployment manifests and pipelines | independently deployed units and operational coupling |

Trace representative use cases from entry point through policy, persistence, and
external calls. Folder names such as `Domain`, `Core`, or `Services` are not proof
of a boundary.

## The dependency rule

A protected policy core must not compile against its delivery or infrastructure
implementations. When policy needs an outer capability, the consuming inner
boundary owns a narrow contract and an outer adapter implements it.

Typical allowed relationships are conceptual, not mandatory project names:

```text
host/composition ──> use cases <── adapters
                         │
                         v
                    domain policy
```

A host may reference adapters to register them. That exception belongs in the
composition root; it does not authorize endpoint or worker code to depend on
adapter internals.

Compile-time project references are the strongest enforcement. Namespace and
architecture tests supplement them when multiple conceptual layers share a
project or when a host-reference exception needs policing.

## Layout options

### Cohesive simple service

A small system can keep host, use cases, and adapters in one project with clear
namespaces and ownership. This is honest when there is little policy to isolate.
Do not create empty projects in anticipation of complexity.

### Vertical slices

Group artifacts that change together by use case: transport contract, handler,
validation, and local data access. Keep cross-slice coupling explicit. Extract a
shared domain concept only when multiple slices truly share its invariant and
language.

### Layered clean boundary

Separate domain policy, application/use cases, adapters, and host when independent
compilation materially protects the core. A commonly seen four-project shape is
only one option:

```text
src/
  Product.Domain/
  Product.Application/
  Product.Infrastructure/
  Product.Host/
tests/
  Product.Domain.Tests/
  Product.Application.Tests/
  Product.IntegrationTests/
  Product.ArchitectureTests/
```

The names and count can differ. Some repositories split persistence from other
adapters, host several transports, use modules within one deployment, or place
composition in a bootstrap project.

### Hybrid

Keep simple reads or CRUD slices direct while routing invariant-heavy writes
through a domain core. A hybrid must still state where transactions,
authorization, shared contracts, and cross-feature policy live; “hybrid” is not
permission for accidental dependencies.

## Composition root

Locate the actual startup boundary. It owns:

- concrete adapter registration and service lifetimes;
- provider, transport, and environment configuration;
- middleware, filters, consumers, scheduled work, and hosted-service wiring;
- startup validation and operational health integration.

Keep registrations near the module that owns them when that is the established
pattern, but ensure the final host is the only place assembling the complete
runtime graph. Do not move business decisions into registration extensions.

## Organize for change

Within an application boundary, feature/use-case folders often keep commands,
queries, handlers, validation, and result contracts cohesive. Type-based folders
can be valid when tooling or established conventions rely on them. Choose the
shape that minimizes unrelated navigation and coupling in this repository.

Within a domain boundary, organize around business concepts and aggregate
ownership. Within adapters, organize around external systems or persistence
concerns. Avoid a generic `Common` area that becomes an outward-dependency escape
hatch.

## Incremental migration

Do not begin with a flag-day move. Use a thin, reversible sequence:

1. pin current observable behavior with characterization or integration tests;
2. select one high-value seam or use case;
3. define the target dependency and compatibility contract;
4. move policy without changing public behavior;
5. redirect the adapter and composition root;
6. verify build graph, behavior, deployment, and rollback;
7. repeat only if the boundary pays for itself.

A public contract, database schema, serialized event, or deployment topology
change requires explicit authorization and a compatibility plan. If the smallest
safe migration still makes an unauthorized material trade-off, return `Blocked`.

## Decision record

For each material boundary, record:

- repository facts and assumptions;
- responsibility and owner;
- allowed and forbidden dependencies;
- runtime data/control flow;
- transaction and failure boundary;
- selected option and why a simpler option was insufficient;
- migration and rollback implications;
- tests that prove the boundary.
