---
title: No Legacy Patterns
impact: CRITICAL
impactDescription: Never use legacy patterns - they block migration efforts
tags: legacy, migration, chakra, mobx, yup
---

## No Legacy Patterns

**Impact:** CRITICAL - Never use legacy patterns - they block migration efforts

The codebase is actively migrating away from legacy libraries. Using them in new code blocks migration and creates tech debt.

## Prohibited Patterns

| Legacy | Modern Alternative |
|--------|-------------------|
| `@redpanda-data/ui` | Redpanda UI Registry (`components/redpanda-ui/`) |
| `@chakra-ui/react` | Registry components + Tailwind classes |
| MobX, decorators | Zustand for global state |
| Class components | Functional components + hooks |
| Yup validation | Zod |
| `any` type | `unknown` or specific types |
| Jest | Vitest |

## Common Violations

**Chakra UI:**
```tsx
// WRONG
import { Button, Box, Flex } from "@chakra-ui/react";
import { Button, Modal } from "@redpanda-data/ui";
import { useDisclosure, useToast } from "@chakra-ui/react";
```

```tsx
// CORRECT
import { Button } from "components/redpanda-ui/components/button";
import { Dialog } from "components/redpanda-ui/components/dialog";
// Use useState instead of useDisclosure
// Use toast from sonner instead of useToast
```

**MobX:**
```typescript
// WRONG
import { makeAutoObservable, observable, action } from "mobx";
import { observer } from "mobx-react-lite";

@observer
class Store {
  @observable users = [];
}
```

```typescript
// CORRECT
import { create } from "zustand";

const useStore = create<State>((set) => ({
  users: [],
  addUser: (user) => set((s) => ({ users: [...s.users, user] })),
}));
```

**Class Components:**
```tsx
// WRONG
class UserProfile extends React.Component<Props, State> {
  componentDidMount() { /* ... */ }
  render() { return <div />; }
}
```

```tsx
// CORRECT
const UserProfile = ({ userId }: Props) => {
  const { data } = useQuery(getUser, { id: userId });
  return <Card>{data?.name}</Card>;
};
```

## Migration Guidance

When modifying files with legacy patterns:
1. **Don't add** new legacy imports
2. **Consider migrating** the component if changes are significant
3. **Keep changes minimal** if just fixing bugs
4. **New features** must use modern patterns

### MobX → React State: Check Side-Effects

When converting observables to React state, automatic behaviors must become explicit:
- MobX observable arrays auto-update UI when mutated
- React state requires explicit `setState()` calls
- Clearing, resetting, or initializing state needs manual handling

**Checklist**: List all observable mutations → add equivalent `setState` calls.

## Legacy Locations

- MobX stores: `src/state/` (do not add new files)
- Chakra components: throughout codebase (migrate on touch)
