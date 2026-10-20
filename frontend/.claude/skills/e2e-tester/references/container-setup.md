# Container setup reference

The maintained lifecycle lives in `tests/shared/global-setup.mjs`, shared by all four
Rstest variant configs. Read [Testcontainers details](../../../../tests/TESTCONTAINERS.md)
and [test commands](../../../../tests/README.md) before changing it.

Build the frontend first. Setup copies its assets into the backend build context,
builds an image, starts the configured brokers/services and backend, and waits for
readiness. The returned teardown owns live handles; `global-teardown.mjs` provides
manual crash recovery using the serialized state. Preserve failure cleanup.

Variant metadata/configuration lives in `tests/test-variant-*/config/`. Images are
pinned in `test-images.json` at the repository root. Local single-variant runs remap host ports;
container-to-container addresses stay unchanged.

Enterprise requires a separate backend checkout (`ENTERPRISE_BACKEND_DIR`). Global
setup authenticates through the real login form and stores browser state under the
gitignored `playwright/.auth/` directory. Login-error specs override storage with an
empty state. There is no HTTP Basic-auth replacement for application login.

CI runs three OSS variants in `.github/workflows/frontend-verify.yml`. It installs
Chromium and Linux dependencies, downloads the same-run frontend build, and invokes
`bun run e2e-test:variant <variant>`. Failure evidence is uploaded from `tests/.rstest/`.
The enterprise backend remains the responsibility of downstream enterprise CI.

For port conflicts, inspect the owner or use the dynamic-port wrapper. Never kill an
unidentified developer process. For service failures, inspect Docker logs and the
variant state file rather than weakening waits or assertions.
