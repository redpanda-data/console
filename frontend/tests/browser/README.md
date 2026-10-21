# Browser-only component checks

These tests exercise real CSS view-transition animation and hit testing without a backend.

From `frontend`:

```sh
bun run install:chromium
bun run test:browser
```

The loading-boundary cases use the production stylesheet, hold the editor snapshot animations active, and check that background controls remain clickable. Reduced-motion mode must create no animations.
