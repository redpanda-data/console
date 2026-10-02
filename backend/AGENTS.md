# Redpanda Console Backend

Go HTTP API server for managing and debugging Kafka/Redpanda workloads. Serves a legacy REST
API under `/api` and a Connect RPC API re-exposed as JSON through gRPC-Gateway under
versioned paths.

Module: `github.com/redpanda-data/console/backend`. See [../AGENTS.md](../AGENTS.md) for
repo-wide rules.

**How to use this file.** It tells you the rules you cannot infer and where to look for the
rest. It is not a specification. Before relying on a specific, read the source: the linter
config for lint rules, the Taskfile for commands, `routes.go` for what is wired, and the
package you are editing for its own patterns. When this file and the code disagree, the code
wins and this file needs a fix.

## Hard rules

Non-obvious and enforced. Everything else the linter will tell you.

**Errors.** Construct Connect errors through `apierrors`
([pkg/api/connect/errors/](pkg/api/connect/errors/)), never `connect.NewError` directly, or
you lose the error details the helper always attaches. That package also holds converters for
Kafka, Schema Registry, and Redpanda Admin API errors; check for one before writing your own.
Legacy REST handlers use a different model, `*rest.Error` with `rest.SendRESTError`.

**Logging.** `log/slog` only, and `sloglint` is strict:

- No global logger. Take a `*slog.Logger` as a constructor parameter and store it.
- Attributes only: `slog.String("topic_name", name)`, never loose key/value pairs.
- snake_case keys, lowercase messages, and `"error"` rather than `"err"`.
- Sub-loggers via `loggerpkg.Named(parent, "topic_service")`.

**Doc comments.** `revive` runs with `enable-all-rules: true`, so every exported identifier
needs a doc comment.

**License header.** Every new `.go` file starts with the BSL block:

```go
// Copyright 2026 Redpanda Data, Inc.
//
// Use of this software is governed by the Business Source License
// included in the file licenses/BSL.md
//
// As of the Change Date specified in that file, in accordance with
// the Business Source License, use of this software will be governed
// by the Apache License, Version 2.0
```

**Imports.** Three blocks: standard library, third-party, then
`github.com/redpanda-data/console/backend`. `task backend:fmt` sorts them.

**Generated code.** Never hand-edit `pkg/protogen/`. Run `task proto:generate` from the
repository root.

Complexity limits are enforced too, but you will hit those as lint failures rather than
needing to plan for them. The full linter set is in [.golangci.yaml](.golangci.yaml).

## Comments

Keep comments to a minimum. Less is more.

- Doc comments on exported identifiers are required, as above. One line is enough.
- Do not restate the code. `// increment the offset` above `offset++` is noise.
- No banner comments (`// --- helpers ---`), no labelling the obvious.
- Comment the **why**: a non-obvious constraint, a protocol quirk, a deliberate deviation, a
  reason an ordering matters. Link the ticket or upstream issue if there is one.
- Prefer a better name or a small extracted function over a paragraph of explanation.
- No commented-out code. `TODO`/`FIXME` must name a ticket or an owner.

Do not add comments to code you touched just to show what changed. That goes in the commit
message.

## Commands

From the **repository root**. `task --list` has the rest.

```bash
task backend:fmt                # format
task backend:lint               # golangci-lint
task backend:test-unit          # unit tests
task backend:test-integration   # unit + integration, needs Docker
task backend:verify             # lint, generate, integration tests
task backend:generate           # go generate, proto, format
```

`CLI_ARGS` is forwarded: `task backend:test-integration -- ./pkg/api/...`.

To invoke `go` directly, run it **from `backend/`**, since the commands are module-relative:

```bash
go test ./pkg/serde/... -run TestJsonSerde
go test --tags=integration ./pkg/api/connect/integration/... -run TestSuite/TestTopicV1
```

Run the server from `backend/`, with a local cluster from `docs/local/`
(`docker compose up -d`):

```bash
KAFKA_BROKERS=localhost:9092 SERVEFRONTEND=false SERVER_LISTENPORT=9090 go run cmd/api/main.go
```

**Before pushing:** `task backend:fmt && task backend:lint && task backend:test-unit`, then
`task backend:test-integration` if you touched `pkg/api/` or `pkg/console/`.

## Where things are

Only `cmd/` and `pkg/`. No `internal/`.

| Path | Holds |
|---|---|
| `cmd/api/` | the single binary |
| `pkg/api/` | HTTP and gRPC layer. `api.go` wires dependencies, `routes.go` mounts everything, `hooks.go` is the enterprise extension contract |
| `pkg/api/connect/service/<domain>/<version>/` | Connect service implementations |
| `pkg/console/` | core business logic behind the `Servicer` interface |
| `pkg/factory/` | Kafka, Redpanda Admin, and Schema Registry client factories, consumed as interfaces |
| `pkg/serde/` | auto-detecting serialization for Kafka messages |
| `pkg/config/` | koanf config, one file per sub-struct |
| `pkg/logger/` | slog setup with functional options |
| `pkg/testutil/` | testcontainers helpers; image tags come from `test-images.json` at the repo root |
| `pkg/protogen/` | generated, do not edit |

`routes.go` is the map. It shows which services exist, which API versions are mounted, and
which are OSS placeholders that enterprise replaces. Read it rather than assuming.

## Conventions

- Wrap errors with context: `fmt.Errorf("failed to describe topic: %w", err)`. Compare with
  `errors.Is`/`errors.As`, never `==` or string matching.
- `ctx context.Context` is the first parameter, and never stored in a struct.
- Accept interfaces, return concrete types. Assert conformance at package level:
  `var _ dataplanev1connect.TopicServiceHandler = (*Service)(nil)`.
- Constructors are `NewX(cfg, logger, collaborators...)`, dropping any the service does not
  need. No setters.
- A service package splits by role: `service.go` for the RPCs, `mapper.go` for proto
  conversion, `defaulter.go` for request defaults, `util.go` for error translation. The
  package is named for the domain even inside a `v1/` directory, so imports are aliased
  (`topicsvcv1`).
- `pkg/console` puts one exported operation per file, named in snake_case after the operation.
- Config sub-structs implement `SetDefaults`, `RegisterFlags`, and `Validate` as needed. Do
  not add an empty method to complete the set. Read `LoadConfig` in
  [pkg/config/config.go](pkg/config/config.go) before changing precedence; the order of
  defaults, flags, file, and env is load-bearing and not what you would guess.
- Wiring is manual, no DI framework.

## Enterprise boundary

This is the OSS foundation. `console-enterprise` imports it and extends it through the `Hooks`
contract in [pkg/api/hooks.go](pkg/api/hooks.go), which lets it add interceptors, replace OSS
service implementations, register additional services, and supply license and feature-flag
information.

Changing a hook signature breaks console-enterprise. Call it out in the PR description.

There is a stale duplicate of these declarations in `pkg/api/hooks/`. Nothing imports it;
do not add to it.

## Testing

- Table-driven is the house pattern: a slice of cases with a `name` and a `validateFn`
  closure, run through `t.Run(tc.name, ...)`. See
  [topic/v1/mapper_test.go](pkg/api/connect/service/topic/v1/mapper_test.go).
- testify: `require` where a failure makes later assertions meaningless, `assert` for value
  comparisons. Both in one test is normal.
- Tests live in the same package as the code (`package topic`, not `topic_test`).
- Unit tests carry no build tag. Integration tests carry `//go:build integration` and the
  `_integration_test.go` suffix, except in `pkg/api/connect/integration/` where the tag alone
  marks them.
- Integration suites use testcontainers-go and testify/suite. See
  [integration/api_suite_test.go](pkg/api/connect/integration/api_suite_test.go).
- Mocks are gomock, from a `//go:generate mockgen` directive next to the interface.
  Regenerate with `task backend:generate`.
