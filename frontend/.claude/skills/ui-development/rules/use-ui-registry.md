---
title: Use UI Registry Components
impact: CRITICAL
impactDescription: Using deprecated library causes inconsistent UI and maintenance burden
tags: components, registry, ui, imports
---

# Use UI Registry Components (CRITICAL)

## Explanation

Always use components from `src/components/redpanda-ui/`. The `@redpanda-data/ui` package is deprecated and should never be used. Registry components are maintained, tested, and follow design system standards.

## Incorrect

```tsx
// Using deprecated library
import { Button } from '@redpanda-data/ui';

export function MyComponent() {
  return <Button>Click me</Button>;
}
```

```tsx
// Using Chakra directly
import { Button } from '@chakra-ui/react';

export function MyComponent() {
  return <Button>Click me</Button>;
}
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
