---
title: Use UI Registry Components
impact: CRITICAL
impactDescription: Using deprecated library causes inconsistent UI and maintenance burden
tags: components, registry, ui, imports
---

# Use UI Registry Components (CRITICAL)

## Explanation

Always use components from `src/components/redpanda-ui/`. Registry components are maintained, tested, and follow design system standards.

## Incorrect

```tsx
// Hand-rolling a component the registry already ships
export function MyComponent() {
  return <button className="rounded-md bg-primary px-3 py-2">Click me</button>;
}
```

```tsx
// Installing an external UI library for something the registry covers
import { Button } from 'some-other-ui-kit';
```

## Correct

```tsx
// Using registry
import { Button } from 'components/redpanda-ui/button';

export function MyComponent() {
  return <Button>Click me</Button>;
}
```

## Installing New Components

```bash
# Check what's already installed
ls src/components/redpanda-ui/

# Install from registry
yes | bunx @fumadocs/cli add --dir https://redpanda-ui-registry.netlify.app/r button
```

## Reference

- https://redpanda-ui-registry.netlify.app
- MCP tools: `mcp__redpanda-ui__search-docs`, `mcp__redpanda-ui__get_component`
- See also: [no-legacy](../../code-standards/rules/no-legacy.md) — full list of prohibited legacy patterns
