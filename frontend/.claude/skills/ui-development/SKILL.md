---
name: ui-development
description: Build Console UI with UI SDK behavior, Redpanda tokens, and accessible controls.
---

# UI Development

Use Console-owned components from `src/components/redpanda-ui/components/`.
This directory is no longer vendored; change it with regression coverage.

- Follow `node_modules/@ui-sdk/core/skills/ui-sdk/SKILL.md`; read installed `@ui-sdk/react/docs/llms.txt` and the relevant component docs before editing behavior.
- Prefer existing wrappers and variants. Preserve Redpanda tokens, density, focus, and reduced-motion behavior.
- Wire state through SDK change callbacks, including RHF controllers, so agent actions cannot bypass validation.
- Use SDK parts for interactive controls. Mark secret values with `data-agent-secret` and sensitive regions with `data-agent-hidden`.
- `ConsoleWebMcp` owns scoped `console_` WebMCP tools and human-only activity controls. Hosts opt in; mutations require approval. Follow the history/secret/cleanup rules in `frontend/AGENTS.md`.
- Verify keyboard/focus, pointer actions, disabled/read-only controls, and WebMCP callbacks.

| Action | Rule |
|--------|------|
| Use components | `rules/use-ui-registry.md` |
| Customize look | `rules/style-use-variants.md` |
| Tokens | `rules/style-use-tokens.md` |
| Upgrade UI SDK | `rules/registry-upgrade.md` |
| Icons | `rules/icon-system.md` |
