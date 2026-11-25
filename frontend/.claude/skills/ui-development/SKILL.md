---
name: ui-development
description: Build Console UI with the shadcn registry, Tailwind v4, Base UI, and additive UI SDK behavior.
---

# UI Development

Reuse shadcn-based Redpanda components from `src/components/redpanda-ui/components/`.
The shadcn config points to `@redpanda` and the Console Tailwind stylesheet. Review upstream
changes before applying them over Console-local adapters.

- When editing an SDK enhancement, follow `node_modules/@ui-sdk/core/skills/ui-sdk/SKILL.md` and the installed React component docs.
- Prefer existing wrappers and variants. Preserve Redpanda tokens, density, focus, and reduced-motion behavior.
- Route human and SDK actions through the same validation. Native text handlers still work; use SDK change details when you need source or cancellation.
- Keep Base UI as the behavior owner for standard controls; use metadata-only SDK parts for agent coordination. Supplemental SDK controls keep their own behavior owner.
- Mark secret values with `data-agent-secret` and sensitive regions with `data-agent-hidden`.
- `ConsoleWebMcp` owns scoped `console_` WebMCP tools and human-only activity controls. Hosts opt in; mutations require approval. Follow the history/secret/cleanup rules in `frontend/AGENTS.md`.
- Verify keyboard/focus, pointer actions, disabled/read-only controls, and WebMCP callbacks.

| Action | Rule |
|--------|------|
| Use components | `rules/use-ui-registry.md` |
| Customize look | `rules/style-use-variants.md` |
| Tokens | `rules/style-use-tokens.md` |
| Update registry components or UI SDK | `rules/registry-upgrade.md` |
| Icons | `rules/icon-system.md` |
