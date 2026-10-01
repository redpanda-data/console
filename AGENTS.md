# Redpanda Console

Go backend (`backend/`) + React 19 single-page app (`frontend/`) sharing a protobuf API
contract (`proto/`). Builds and tooling are driven by [Task](https://taskfile.dev/) from the
repository root.

## Which rules apply where

Read the nearest file to what you are changing. The nested files own their area; this file
only routes.

| You are changing | Read |
|---|---|
| `backend/**` | [backend/AGENTS.md](backend/AGENTS.md) |
| `frontend/**` | [frontend/AGENTS.md](frontend/AGENTS.md) |
| `proto/**` | this file, plus `buf.yaml` and `taskfiles/proto.yaml` |
| root config, `taskfiles/**`, `.github/**` | this file |
| commit messages, PR description, review | [.github/copilot-instructions.md](.github/copilot-instructions.md) and [CONTRIBUTING.md](CONTRIBUTING.md) |

## Commands

Backend and proto commands run **from the repository root** via `task`. The `./taskw` wrapper
pins the Go toolchain and helper binaries under `build/`.

```bash
task backend:fmt            # format
task backend:lint           # golangci-lint
task backend:test-unit      # unit tests
task backend:test-integration   # unit + integration (needs Docker)
task backend:verify         # lint + generate + integration tests
task proto:lint             # buf lint
task proto:generate         # regenerate backend + frontend protogen
```

Frontend commands run **from `frontend/`** via `bun run <script>`.

## Never edit (generated or vendored)

- `backend/pkg/protogen/` and `frontend/src/protogen/` (regenerate with `task proto:generate`)
- `frontend/src/routeTree.gen.ts` (TanStack Router)
- `frontend/src/components/redpanda-ui/` (UI Registry, sourced from `redpanda-data/ui-registry`)
- `build/` (pinned toolchain)

## Enterprise boundary

This repository is the **OSS foundation**. `console-enterprise` imports
`github.com/redpanda-data/console/backend` and extends it through the hooks system in
`backend/pkg/api/hooks.go`, which lets it add interceptors, change routes, and replace service
implementations.

Features that live behind those hooks (authentication, RBAC, secret management, shadow links,
pipelines, debug bundles) **cannot be exercised from this repository alone**. To test an OSS
change against enterprise, add a replace directive in `console-enterprise/backend/go.mod`:

```go
replace github.com/redpanda-data/console/backend => /path/to/console/backend
```

## Proto changes

`proto/` is published to the Buf Schema Registry as `buf.build/redpandadata/dataplane`. A
change here is an API contract change:

1. Edit the `.proto` file.
2. `task proto:lint && task proto:format`
3. `task proto:generate` and commit the generated output. `proto-generate.yml` fails the PR if
   generated code is out of date.
4. Breaking-change detection runs in CI. Some alpha packages are exempt; check the `ignore`
   list in `buf.yaml` before assuming yours is. Everything else is wire-compatible-only.
