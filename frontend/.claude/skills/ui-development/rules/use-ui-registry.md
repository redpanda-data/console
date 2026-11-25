---
title: Use the Redpanda shadcn Registry
impact: CRITICAL
impactDescription: Keep behavior and agent interactions on one accessible component layer
tags: components, registry, ui, imports
---

# Use Redpanda UI Registry Components

Import `Button`, `Input`, dialogs, selectors, and other wrappers from
`components/redpanda-ui/components/`. Preserve Redpanda variants and tokens.
Shadcn resolves the `@redpanda` namespace through [`components.json`](../../../../components.json).
Prefer existing wrappers to new registry installs. Use the Redpanda registry, not stock Radix
recipes; preview upstream updates and preserve Console-local adapters.
Base UI owns standard interaction and popups. SDK hooks and agent metadata enhance that
layer; never attach a second keyboard, focus, or popup engine to an existing control.

```tsx
import { Button } from 'components/redpanda-ui/components/button';

export function Action() {
  return <Button>Continue</Button>;
}
```

Native `onChange` is supported on Console text controls. Use SDK change details for source
or cancellation, and verify both user and agent paths when editing an enhancement.
