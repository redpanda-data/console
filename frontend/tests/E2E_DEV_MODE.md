# E2E watch mode

The `:dev` aliases run Rstest watch mode against the same Testcontainers stack as a
normal E2E run. They do not provide Playwright Test's UI or start a frontend dev server.

From `frontend/`, with Docker running:

```sh
bun install --frozen-lockfile
bun run install:chromium
bun run build
bun run e2e-test:dev
# Or, with ENTERPRISE_BACKEND_DIR pointing at console-enterprise/backend:
bun run e2e-test-enterprise:dev
```

Rstest re-runs affected tests when test files change. Frontend source changes require a
new production build and restarted test environment, because the backend image embeds
the build. Stop the watcher with Ctrl+C; global teardown stops its containers/network.

For one file or a collection without starting services:

```sh
bun run e2e-test:variant console topics/topic-list.spec.ts
bun run e2e-test:variant console list --summary
```

Single-variant local runs allocate free host ports; `E2E_DYNAMIC_PORTS=0` retains the
variant JSON's fixed ports. `REACT_APP_ORIGIN` overrides the browser URL only; it does
not disable infrastructure setup. `E2E_DEV_MODE` is not a supported switch.

See [test commands](README.md) and [Testcontainers lifecycle](TESTCONTAINERS.md).
