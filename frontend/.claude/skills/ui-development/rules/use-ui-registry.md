---
title: Use Console UI SDK Components
impact: CRITICAL
impactDescription: Keep behavior and agent interactions on one accessible component layer
tags: components, ui-sdk, ui, imports
---

# Use Console UI SDK Components

Import `Button`, `Input`, dialogs, selectors, and other wrappers from
`components/redpanda-ui/components/`. Preserve Redpanda variants and tokens.
The directory is Console-owned: extend its wrappers using SDK primitives when needed,
not registry installs or another UI runtime.

```tsx
import { Button } from 'components/redpanda-ui/components/button';

export function Action() {
  return <Button>Continue</Button>;
}
```

Use SDK change callbacks (`onValueChange`, `onCheckedChange`) for controlled state and
RHF fields. DOM-only listeners do not receive programmatic agent changes.
Read the installed SDK component docs and test user and agent paths before shipping.
