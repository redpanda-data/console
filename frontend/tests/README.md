# Frontend tests

Run tools from `frontend/` through the pinned package scripts. Install with
`bun install --frozen-lockfile`, then `bun run install:chromium` before running tests
(Linux also needs `--with-deps`). Bun is pinned in `.bun-version`; Node must satisfy
`package.json` (Node 22.22 is used for the browser/E2E CI jobs).

## Choose by behavior

| Coverage | Runner/environment | Command |
| --- | --- | --- |
| Pure logic, transforms, mocked module contracts | Bun; Happy DOM supplies import-time browser globals | `bun run test:unit` |
| React components, hooks, DOM, store/transport integration | Rstest + Happy DOM | `bun run test:integration` |
| Bundler/configuration and subprocess integration | Rstest + Happy DOM | `bun run test:integration` |
| Built Module Federation remote | Rstest federation plugin + Happy DOM | `bun run test:federation` |
| Native CSS animation and browser hit testing | Rstest + Playwright Chromium | `bun run test:browser` |
| Native input, viewport and fixture compatibility | Rstest + Playwright Chromium | `bun run test:e2e:canary` |
| Production app, mocked REST/Connect boundary, bundle/worker budgets | Rstest + Playwright Chromium | `bun run build && bun run test:bundle` |
| Running Console + backend + brokers/services | Rstest + Playwright + Testcontainers | `bun run e2e-test:variant console` |

Classify before naming: `.test.ts` is the Bun convention, `.test.tsx` covers DOM/React
integration, `.integration.test.ts` covers non-JSX integration, and `.spec.ts` drives a
real browser. A test does not become an integration just because its module uses JSX.
Focused tests and direct legacy runner imports (including subpaths) are lint errors;
selector helpers such as Ivya and Rstest's transitive internals are not prohibited.
Bun files share a module cache: use scoped spies and restore them instead of `mock.module()`
replacements of shared modules. The React 18/19 legacy-host lifecycle suite runs in Rstest's
isolated integration environment. Bun's DOM preload preserves its native networking globals.

Conversely, testing a route loader against a QueryClient/transport is integration even
without JSX. The shared registry test remains upstream-owned and runs unchanged.

`bun run test` runs units, integrations, federation, browser and native-input canaries,
and enforces the native integration coverage thresholds.
Bundle and full-stack E2E require a built frontend and run as separate CI jobs.
Use `bun run test:unit:watch` or `bun run test:watch` for integration watch mode.
Pass file paths to `bun run test:file:unit` or `bun run test:file:integration`.

## Real end-to-end variants

```sh
bun run install:chromium
bun run build
bun run e2e-test:variant console
bun run e2e-test:variant kafka
bun run e2e-test:variant kafka-connect
ENTERPRISE_BACKEND_DIR=/absolute/path/to/console-enterprise/backend bun run e2e-test:variant console-enterprise
bun run e2e-test
```

Docker must be running. The final command runs every variant, including enterprise;
enterprise requires a separate checkout. It is not replaced with mocked browser tests.
Setup uses `tests/shared/global-setup.mjs`, variant JSON/YAML, pinned `test-images.json`
and the existing Testcontainers resource/cleanup helpers. Teardown also runs after
failure. Local single-variant runs allocate free host ports; CI variants use separate
runners. Console uses eight workers. The quota cases are collected by `quotas/quotas.spec.ts`
and run sequentially within that file so pagination cannot race other quota mutations.
Other variants retain their worker/retry limits.

CI builds the OSS backend image once with `bun run e2e-build:oss`, then passes it to the
E2E matrix as a same-run Docker image artifact. Each matrix job loads the image and sets
`E2E_PREBUILT_IMAGE_TAG=console-backend:e2e-test`; setup still starts real services but
does not rebuild the image. Local commands continue to build automatically when no
prebuilt image is supplied.

```sh
bun run e2e-test:variant console list --summary
bun run e2e-test:variant console topics/topic-list.spec.ts
bun run e2e-test:dev
```

Collection does not start services. The `:dev` aliases use Rstest watch mode with the same
Testcontainers environment; there is no separate Playwright Test UI or dev-server mode. `REACT_APP_ORIGIN` overrides the app URL.
`E2E_PORTS_OVERRIDE` is a JSON port mapping; shadow-link tests also support
`REACT_APP_SHADOW_ORIGIN`. See [development mode](E2E_DEV_MODE.md) and
[Testcontainers details](TESTCONTAINERS.md).

Enterprise authentication remains a real login in global setup, plus an explicit
`authenticate` test. Login-error tests use an unauthenticated context. Pre-existing
pending/skipped tests retain their conditions; the migration adds none.

## Helpers and native behavior

Happy DOM integration tests reject unmocked `fetch` requests and fail at teardown,
even when application error handling catches the rejection. Use explicit Connect
router handlers or narrowly matched REST fixtures; unmatched requests still fail.
There is no localhost success fallback or endpoint allowlist. This guard is confined
to DOM integration setup; native browser and running-application E2E keep real networking.

Import shared `test`/`expect` from `tests/shared/e2e.ts` (or a variant fixture). The runner
is Rstest; `playwright` is the browser automation runtime. Tests retain native Page,
Locator, keyboard, drag, `setViewportSize`, evaluation and screenshots. The native-input
canary exercises trusted events and runtime resizing. No selector-engine adapter,
maintained fork, browser-mode patch or screenshot comparator is needed for these suites.
Ivya is a DOM selector engine, not a runner; Console had no Ivya consumer to remove.

CI rejects focused `test.only`/`describe.only` coverage via the Rstest collection reporter;
real-CLI regressions prove its nonzero exit.

Use `step` and `retryAssertion` from the shared entrypoint for named failures and
assertion retries. Retry deadlines and the former interval sequences are retained.
The retry contract has fake-timer integration regressions. Wrap relative URL expectations
with `appURL('/path')`; Rstest compares full URL strings without resolving them against
the context base URL. This retains exact origin, path and query checks. `testInfo` is now a fixture;
its artifact paths and attachment metadata are test/retry-specific. Non-enterprise variants retain failure screenshots and first-retry videos; enterprise
keeps screenshots/videos off. Traces, videos and screenshots live under `.rstest/` (some commands use `tests/.rstest/`). Upload artifacts
when reporting failures. Bundle screenshots are evidence, not comparison baselines;
no pixel tolerance or bundle-size assertion was relaxed.

## Coverage and CI

```sh
bun run lint:fix
bun run type:check
bun run type:check:tests
bun run test:coverage
```

Bun emits line/function LCOV, not statement/branch counters. Bun and V8 instrument
different source locations, so aggregate hit counts cannot be mixed. All existing
`coverage.config.json` gates now use measured Rstest integration data only; thresholds
are unchanged and enforced natively by Rstest. Bun's unit coverage remains in
`coverage/lcov.info`; Rstest writes its summary, LCOV, HTML and Istanbul maps to
`coverage-integration/`. No custom counter merge or report-copy scripts are needed.

CI collects native coverage blobs from both existing integration shards and runs
`bun run test:coverage:merge` after both succeed. The merge adds untested files once
and enforces the combined thresholds, never thresholds on partial shards. Missing
shard artifacts fail the producer job. CLI regressions compare merged counters with
a full run, reject uncovered code, and prove Bun denominators cannot inflate gates.

`bun run type:check:tests` checks browser/tooling and migrated Bun units through
separate TypeScript projects. Generated/vendored exclusions remain unchanged.
Bun units also write `.rstest/unit.xml`, so the unit job retains failure diagnostics.

`frontend-verify.yml` keeps unit, integration shards and federation gates, and adds real
browser/bundle/native-input and three OSS full-stack E2E variants. Enterprise remains
on the existing downstream enterprise CI path. Browser jobs consume only the build
artifact from their own workflow run, use read-only permissions and expose no secrets.
