# Backend Architecture Best Practices

This document defines the backend architecture, security, authorization, reliability, and engineering practices to follow when building or modifying the application. The goal is a clear, maintainable, testable, secure architecture with strong separation of concerns while avoiding unnecessary abstraction and context-heavy design.

## 1. Architecture & Layer Separation

Follow a predictable flow: Client → Middleware → API/Controller → Service → Repository → ORM/Model → Database. Routes/controllers should parse requests, apply API-level concerns, and call services; services contain business logic and orchestration; repositories contain database access; ORM/models define persistence structures. Requests must never access the database directly, ORM models should not be exposed as API responses, and DTOs/schemas should define explicit request/response contracts. Dependencies should flow inward, with lower-level infrastructure never leaking HTTP, framework, or database-specific concerns into business logic.

## 2. Separation of Concerns

Business logic must never live in routes/controllers, and each file should have one clear purpose centered around a focused class, handler, abstraction, or related utility group. Keep domain/business rules independent from HTTP frameworks, ORM implementations, databases, queues, and external providers wherever practical. Use dependency injection for repositories, databases, caches, queues, and external clients rather than constructing infrastructure dependencies inside business logic. Introduce abstractions only when they provide meaningful maintainability, testability, or flexibility; avoid unnecessary layers, wrappers, managers, factories, and interfaces.

## 3. Middleware & Request Processing

Use middleware for cross-cutting concerns such as authentication, authorization, CORS, CSRF protection, security headers, request logging, rate limiting, request-size limits, and other request-wide policies. Validate and sanitize all untrusted input at the API boundary using DTOs/schemas before it reaches business logic, including request bodies, query parameters, path parameters, headers, file uploads, and external inputs. Propagate useful request context such as correlation IDs, authenticated subject information, deadlines, and tracing metadata without unnecessarily exposing or logging sensitive information.

## 4. Application Lifecycle & Resource Management

Use application lifecycle events/hooks for startup and shutdown responsibilities such as database connections, Redis, Kafka, RabbitMQ, object storage, and other external services. Resources should be initialized once, configured and health-checked during startup, reused efficiently, monitored where appropriate, and gracefully closed during shutdown. On termination, stop accepting new work, allow in-flight requests/jobs to finish where practical, stop background workers, and close infrastructure connections cleanly. External resources should also have defined reconnection and failure behavior.

## 5. Database & Repository

All database queries must live in repositories or appropriate persistence abstractions rather than routes or services. Define clear transaction boundaries for operations involving multiple database changes; operations that must succeed or fail together should be atomic with proper rollback handling. Enforce important data invariants at the database level through unique constraints, foreign keys, not-null constraints, check constraints, and appropriate indexes, because application-level validation alone cannot prevent race conditions. Database connections and pools must be managed through the application lifecycle rather than repeatedly created per request.

## 6. Transactions, Concurrency & Idempotency

Critical operations must remain safe when executed concurrently or retried. Use transactions, atomic database operations, unique constraints, optimistic or pessimistic locking, idempotency keys, state checks, or distributed locks where appropriate. Operations that may be duplicated or retried must produce the same intended result when repeated, and transaction boundaries must account carefully for external side effects because database rollback cannot automatically undo work performed by another system.

## 7. DTOs, Validation & Serialization

Use explicit DTOs/schemas as the boundary between external API contracts and internal application models. Validate incoming data before business logic processes it and map internal ORM/database models to explicit response DTOs rather than serializing them directly. This prevents sensitive fields, internal metadata, implementation details, and future persistence changes from leaking through the public API while keeping API contracts independent of database structure.

## 8. Error Handling

Use centralized exception handling with application-specific exceptions and consistent machine-readable error responses. Services may raise meaningful domain/application exceptions, while centralized handlers translate them into appropriate API responses. Never expose raw database errors, ORM exceptions, stack traces, internal infrastructure details, or raw API responses to clients. Unexpected failures should be logged with appropriate request/correlation IDs and sufficient diagnostic context without logging secrets or sensitive data.

## 9. API Design & Versioning

Keep API contracts explicit, predictable, and backward-compatible where practical. Version public APIs when breaking changes are unavoidable, define clear deprecation policies, and provide a migration path for existing clients. Avoid breaking contracts without planning for compatibility, and ensure response DTOs and validation rules evolve independently from internal database models.

## 10. Database Migrations

Every database schema change must be represented by a version-controlled migration; production schemas must not be modified manually. Prefer expand → migrate → contract strategies for breaking schema changes so old and new application versions can coexist safely during rolling deployments. Migrations should be deterministic, reproducible, and designed with rollback or recovery considerations appropriate to the change.

## 11. JWT Authentication & Session Security

Use short-lived access tokens and securely managed long-lived refresh tokens. For browser applications, sensitive session/refresh credentials should use Secure, HttpOnly, appropriately SameSite-configured cookies; access tokens may be kept in JavaScript memory when the architecture requires them. Public APIs may use appropriate API keys or bearer-token authentication. JWTs must have their signature, algorithm, expiration, issuer, audience, not-before, and required claims validated, must use secure signing keys with rotation where appropriate, and must never contain sensitive information. Refresh tokens should support rotation, revocation, reuse detection, and server-side invalidation where required; logged-out refresh-token JTIs may be blacklisted in Redis.
Always send sensitive data through headers only for most security.

## 12. CSRF Protection

Any browser authentication mechanism based on cookies must be protected against CSRF for state-changing operations. Understand which endpoints rely on session cookies, use framework-supported CSRF tokens for form submissions where applicable, ensure JavaScript state-changing requests are not simple cross-site requests, consider Fetch Metadata protections, use SameSite cookies as an additional defense, and never use GET for state-changing operations. Prefer SameSite=Strict where compatible, otherwise use the least permissive setting required by the application's workflow.

## 13. Authorization: RBAC & Ownership

RBAC should model each user with a defined role, with roles mapped to permissions through dedicated persistence structures where needed. Resource ownership is a separate authorization concern: permission to perform an action does not automatically mean permission to perform it on every resource. Administrative roles may bypass ownership checks only when explicitly defined by the application's authorization policy, and all authorization decisions must happen server-side.

## 14. Authorization: ABAC

ABAC should make policy-driven authorization decisions using the four core attributes: Subject, Resource, Action, and Environment. Policies may consider identity, role, department, clearance, resource ownership or sensitivity, requested action, location, time, IP, device, and other relevant context. New authorization rules should normally be introduced through policy/configuration changes rather than new database schemas or user roles, and ownership, contextual restrictions, and time/location conditions should be represented directly in policy logic. Authorization must fail closed: unless an explicit policy evaluates to ALLOW, access is denied.

## 15. Security by Default

Follow least privilege, deny-by-default, secure defaults, strict input validation, safe output handling, TLS, security headers, dependency vulnerability scanning, request limits, and protections against common threats such as injection, SSRF, path traversal, and resource exhaustion. Users, services, database accounts, API keys, containers, and infrastructure components should receive only the permissions necessary for their responsibilities, with elevated access tightly controlled.

## 16. Rate Limiting & Abuse Protection

Public and sensitive endpoints should use appropriate rate limiting, throttling, request-size limits, connection limits, and timeouts to prevent brute-force attacks, resource exhaustion, denial-of-service conditions, and accidental overload. Apply stronger protections to authentication, password-reset, token, expensive-operation, and other abuse-prone endpoints where appropriate.

## 17. Secrets, Configuration & Privacy

Separate configuration from application code and never commit secrets, credentials, private keys, tokens, or other sensitive configuration to source control or container images. Validate required configuration during startup and use appropriate secret-management mechanisms in production. Collect, process, log, and retain only data required for the application's purpose, protecting sensitive information through appropriate encryption, access controls, masking, retention, and secure deletion practices.

## 18. Caching

Treat Redis and other caches as optimization layers unless they are explicitly designed as a source of truth. Define appropriate TTLs, invalidation strategies, consistency expectations, and cache stampede protection. Correctness must never depend on cached data being present or fresh, and stale or missing cache entries must safely fall back to the authoritative data source when appropriate.

## 19. External Services & Resilience

External service calls must have explicit connection and request timeouts, appropriate retry policies, exponential backoff, idempotency requirements, and graceful failure behavior. Never blindly retry operations that can create duplicate side effects. Use circuit breakers, bulkheads, health checks, or graceful degradation where the system's reliability requirements justify them, and treat external dependencies as potentially unavailable.

## 20. Background Jobs & Messaging

Long-running or non-critical work should be delegated to background workers through reliable queues such as Kafka or RabbitMQ where appropriate. Jobs and consumers must be designed for idempotency and should support timeouts, controlled retries with backoff, failure handling, and dead-letter processing where required. Queue-based processing must not assume that messages are delivered exactly once.
Implement DLQ and set up tracking on them so that engineers gets notified when messages starts piling up. 

## 21. Observability & Auditability

Provide structured application logs, metrics, request/correlation IDs, and distributed tracing where appropriate so requests, failures, latency, database operations, external calls, queues, and background jobs can be diagnosed across the system. Security-sensitive and business-critical actions such as authentication changes, permission changes, administrative operations, exports, deletions, and financial actions should produce structured audit records without storing secrets or unnecessary sensitive information.

## 22. Health Checks

Provide separate liveness and readiness checks. Liveness should indicate whether the application process is functioning, while readiness should determine whether the application is initialized and capable of serving traffic based on required dependencies. Do not make liveness depend on every external dependency if doing so could cause healthy processes to restart unnecessarily during temporary dependency failures.

## 23. Testing

Business logic should be independently testable without HTTP or infrastructure dependencies. Repositories should have integration tests against realistic databases, APIs should test middleware and contracts, and critical authorization, transaction, concurrency, error, and failure paths should be explicitly covered. Tests should verify both successful behavior and important security and recovery boundaries.

## 24. Timeouts & Resource Safety

Every network, database, external-service, and background operation should have an explicit timeout to prevent indefinitely blocked resources, thread exhaustion, connection exhaustion, and cascading failures. Resource limits and cleanup behavior should be defined for requests, file uploads, database pools, queues, workers, and external connections.

## 25. Final Architecture Rules

The architecture should remain simple enough for engineers and AI agents to understand quickly: business logic belongs in services/domain code, database access belongs in repositories, API contracts belong in DTOs/schemas, cross-cutting request concerns belong in middleware, and infrastructure lifecycle belongs in application startup/shutdown handling. Prefer clear boundaries, meaningful names, explicit dependencies, secure defaults, observable behavior, testability, and maintainability over architectural complexity.
