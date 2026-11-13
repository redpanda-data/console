---
title: Upgrade Console UI SDK
impact: HIGH
impactDescription: Keep behavior and styling compatible across SDK upgrades
tags: ui-sdk, migration, upgrade
---

# Upgrade Console UI SDK

Console owns `src/components/redpanda-ui/`; do not overwrite it from the old Redpanda registry.
Upgrade `@ui-sdk/core` and `@ui-sdk/react` together, pinned to the same exact version.

1. Read the release's installed docs and public type definitions.
2. Adapt wrappers and every affected caller, retaining Redpanda tokens and variants.
3. Verify controlled forms, keyboard/focus, popup placement, drag/reorder, and resizing.
4. Verify native WebMCP registration, secret redaction, human approval, and cleanup.
5. Run `bun run type:check`, `bun run type:check:tests`, `bun run lint:fix`,
   `bun run test`, and `bun run build`; exercise the real UI before publishing.

Never restore a replaced primitive runtime merely to silence a failed migration test.
