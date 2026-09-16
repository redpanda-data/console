# Browser-only component checks

These tests exercise real CSS view-transition animation and hit testing without a backend.

From `frontend`:

```sh
bunx playwright install chromium
bunx playwright test --config tests/browser/playwright.config.ts
```

The loading-boundary cases use the production stylesheet, hold the editor snapshot animations active, and check that background controls remain clickable. Reduced-motion mode must create no animations.
