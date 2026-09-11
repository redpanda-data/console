---
name: ui-development
description: Build UI with Redpanda Registry components, Tailwind v4, and accessibility best practices.
---

# UI Development

Build user interfaces with the Redpanda UI Registry.

## Activation Conditions

- Building/creating UI components or pages
- Keywords: "design system", "ui", "frontend", "registry", "component"
- Modifying existing registry components

## Quick Reference

| Action | Rule |
|--------|------|
| Use components | `use-ui-registry.md` |
| Add spacing | `style-no-margin-on-registry.md` |
| Customize look | `style-use-variants.md` |
| Pick a colour or text size | `style-use-tokens.md` |
| Pull a new registry version | `registry-upgrade.md` |
| Use icons | `icon-system.md` |

## Workflow

### 1. Fetch Documentation

```
FIRST: Use MCP tool mcp__redpanda-ui__search-docs or mcp__redpanda-ui__get_component
```

### 2. Check Existing Components

```bash
ls src/components/redpanda-ui/
```

## Critical Rules

### ALWAYS

- Use Registry components from `src/components/redpanda-ui/`
- Call `mcp__redpanda-ui__get_component` as first action before writing UI code
- Install components via CLI

### NEVER

- Use `@redpanda-data/ui` (deprecated) - see [no-legacy](../code-standards/rules/no-legacy.md)
- Copy/paste registry source (install via CLI)
- Install external UI libraries without user request
- Use inline `style` prop on registry components
- Add margin `className` directly to registry components

### NEVER (styling)

- Raw palette classes (`bg-gray-100`, `text-red-600`) or raw hex/`bg-[#…]` — use theme tokens
- Stock text sizes (`text-sm`, `text-lg`) — use `text-body-*` / `text-heading-*`
- Retired v2 token names (`text-error`, `bg-surface-default`, `outline-*`, `*-subtle` on a tone) —
  they compile to nothing. See `style-use-tokens.md`

### WHEN MODIFYING REGISTRY COMPONENTS

Only with explicit sign-off — that directory is synced, so a local edit is lost on the next pull
unless someone re-applies it. If you do:

1. Mark it `[upstream]` in a comment on the block, saying what it adds and why it isn't upstream yet.
   `git grep '\[upstream\]'` is how the next upgrade finds these — an unmarked change is a silent
   regression waiting for the next sync.
2. Keep it minimal and backwards-compatible.
3. Cover it with a test in the app, so a dropped local change fails a test rather than a screenshot.
4. Track it for contribution upstream.

See `registry-upgrade.md` for the pull-and-migrate procedure.

## Rules

See `rules/` directory for detailed guidance.
