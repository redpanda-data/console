# Production bundle checks

From `frontend/`:

```sh
bun run install:chromium
bun run build
bun run test:bundle
```

Runs isolated Chromium against the production build, with deterministic REST/Connect
fixtures and no live cluster. Unknown backend requests fail the test. Third-party
telemetry/content is stubbed; these tests do not verify backend or hosted content.

Cold Overview, Topics, and topic Messages must not request Monaco and must stay below
4.7 MB of uncompressed JavaScript. Documentation must defer at least 750 KB until its
tab is selected. Tests also exercise JSON/YAML workers, direct Documentation links,
tab revisits, and chunk-failure recovery. Existing component/federation tests cover
pipeline diff wiring; this suite does not authenticate an embedded enterprise host.

Asset attachments count each requested script URL once, reading physical file sizes
and independent gzip/Brotli compression. They are content-size estimates, not HTTP
transfer measurements. No child-compiler or concatenated-module totals are added.
Screenshots, recordings, and asset inventories are in `.rstest/`.

To compare a retained build, set `BUNDLE_BUILD_DIR` to its absolute directory. Run
against the same browser/fixtures; old eager builds should fail the deferral budgets.
