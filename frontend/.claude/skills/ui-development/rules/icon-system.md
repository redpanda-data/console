---
title: Icon System
impact: MEDIUM
impactDescription: Use central icon imports from components/icons
tags: icons, lucide, imports
---

## Icon System

**Impact:** MEDIUM - Use central icon imports from components/icons

All icons are imported from `src/components/icons/index.tsx`. This ensures consistency and makes icon management easier.

**Incorrect:**
```tsx
// WRONG: Direct imports from icon packages
import { Check } from 'lucide-react';
import { FaGithub } from 'react-icons/fa';
import { CheckIcon } from '@chakra-ui/icons';
import { PlusIcon } from '@heroicons/react/24/outline';
```

**Correct:**
```tsx
// CORRECT: Import from central icon system
import { CheckIcon, TrashIcon, AlertIcon, PlusIcon } from 'components/icons';

const MyComponent = () => (
  <>
    <CheckIcon size={20} />
    <TrashIcon size={16} color="#ff0000" />
    <AlertIcon className="text-yellow-500" />
  </>
);
```

## Allowed Icon Packages

| Package | Purpose |
|---------|---------|
| `lucide-react` | Primary icon library (1600+ icons) |
| Custom SVGs | Brand-specific or unique icons |
| `@icons-pack/react-simple-icons` | Brand logos (Redpanda Connect only) |

## Forbidden Packages

- `react-icons`
- `@chakra-ui/icons`
- `@heroicons/react`
- `@primer/octicons-react`

## Icon Props

```tsx
<CheckIcon
  size={20}              // Number or string
  color="#ff0000"        // CSS color value
  strokeWidth={2}        // Lucide icons only
  className="text-muted" // Tailwind classes
/>
```

## Adding New Icons

1. Check if exists in `src/components/icons/index.tsx`
2. If not, add export from `lucide-react`:
   ```tsx
   export { Rocket as RocketIcon } from 'lucide-react';
   ```
3. Use semantic naming with `Icon` suffix
4. For brand logos, use `@icons-pack/react-simple-icons`
