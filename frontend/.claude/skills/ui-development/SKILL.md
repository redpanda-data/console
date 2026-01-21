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

### WHEN MODIFYING REGISTRY COMPONENTS

If editing files in `src/components/redpanda-ui/`:
1. Document the change in a comment with `// UPSTREAM: <reason>`
2. Keep changes minimal and backwards-compatible
3. Track for eventual contribution to upstream registry

## Rules

See `rules/` directory for detailed guidance.
