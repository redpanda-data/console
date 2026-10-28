# Embedded Console entries

Console ships two independent Module Federation containers. Use `bun run build`
to build both into the frontend artifact (`build/`). The builds run sequentially:
the first cleans `build/`, then the React 19 build writes `build/react-19/`.

| Entry URL | Container global | Exposes | React ownership |
| --- | --- | --- | --- |
| `/embedded.js` | `rp_console` | Existing `App`, `BridgeApp`, `EmbeddedApp`, `injectApp`, `config`, `types` | Private to Console; unchanged |
| `/react-19/embedded.js` | `rp_console_react19` | `ReactApp`, `types` | Shared with a compatible React 19 host |

The React 19 entry exposes `ConsoleApp` directly with the existing
`ConsoleAppProps` contract. It does not create a React root or use the bridge.
Hosts render it in their own React tree and must share singleton `react`,
`react-dom`, `react/jsx-runtime`, `react/jsx-dev-runtime`, and `react-dom/client`.
The remote is consume-only (`import: false`) for all five React keys. It does
not bundle or provide a private fallback that can compete with a loaded host
version. Both sides require `^19.3.0`; React and React DOM in the host must use
the same version. Query clients, routers and other application libraries remain private.

Separate containers are intentional. Enabling shared React on the original
container would also change its compatibility exports and can break React 18
hosts. Older hosts continue using the original URL, exports and isolated renderer.
Existing host URLs do not automatically switch to the new entry.

An older Console can return its SPA `index.html` with HTTP 200 for a missing
optional entry or manifest. Do not detect availability from status alone. Treat
HTML content, a manifest parse failure, a missing container global, an incompatible
share scope, or a module load failure as unavailable and fall back to the original
entry. Check the manifest before executing the optional script.

Release/image pipelines must run `bun run build` and recursively copy all of
`build/`, including `react-19/`, into the embedded frontend artifact. Running
`rsbuild build` directly builds only the original container. `build-local-test`
intentionally builds only the app used by the standalone E2E variants; it is not
a release artifact. `build:react19` alone does not preserve its output across a
later main-app build, which cleans the parent directory.

`bun run analyze` retains the main-app report in `build-stats/rsdoctor/` and the
optional container report in `build-stats/rsdoctor-react19/`. Select the matching
`rsdoctor-data.json` when using `analyze:agent`.

## Release sequence

1. Release Console with both entries. Keep all compatibility exports and the
   bridge dependency in this prerequisite release.
2. Deploy that release to every environment required by the consuming host's
   minimum-supported-version policy, including its rollback targets.
3. Verify the deployed React 19 entry and a real host + Console flow. Confirm
   authentication, topic loading, navigation, cluster changes and error recovery.
4. Only then switch the host to `/react-19/embedded.js` and remove its bridge.

Merging this change alone neither upgrades deployed Console instances nor makes
an older Console version compatible. Host cutover is a separate change. Rolling
back the host to the original entry remains possible while Console retains it.
Removing Console's compatibility exports is out of scope.

## Verification

`bun run test:federation` builds both real remote graphs. It renders `ReactApp`
with an independently bundled host React renderer through its token callback,
and mounts the original bridge and legacy shim against a React 18 share scope
whose getters fail if consumed. This protects runtime sharing and isolation;
it does not replace the deployed full-app verification above.
