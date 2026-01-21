---
title: Use unknown Instead of any
impact: HIGH
impactDescription: unknown forces type narrowing, catching errors at compile time
tags: typescript, unknown, type-narrowing, safety
---

# Use unknown Instead of any (HIGH)

## Explanation

When you truly don't know a type, use `unknown` instead of `any`. Unlike `any`, `unknown` requires you to narrow the type before using it, catching errors at compile time rather than runtime.

## Incorrect

```typescript
// any allows unsafe operations
function processResponse(data: any) {
  return data.items.map(item => item.name); // No error, but might crash
}

// Casting through any
const config = JSON.parse(str) as any;
console.log(config.setting); // No type safety
```

## Correct

```typescript
// unknown requires narrowing
function processResponse(data: unknown) {
  // Type guard
  if (isResponseData(data)) {
    return data.items.map(item => item.name); // Safe!
  }
  throw new Error('Invalid response format');
}

// Type predicate for narrowing
interface ResponseData {
  items: Array<{ name: string }>;
}

function isResponseData(data: unknown): data is ResponseData {
  return (
    typeof data === 'object' &&
    data !== null &&
    'items' in data &&
    Array.isArray(data.items)
  );
}

// Zod for runtime validation
import { z } from 'zod';

const ConfigSchema = z.object({
  setting: z.string(),
  enabled: z.boolean(),
});

const config = ConfigSchema.parse(JSON.parse(str));
console.log(config.setting); // Type-safe!
```

## Narrowing Techniques

| Technique | Use When |
|-----------|----------|
| `typeof` | Primitives (string, number, boolean) |
| `instanceof` | Class instances |
| `in` operator | Object property checks |
| Type predicates | Complex type guards |
| Zod/validation | External data (API, JSON) |

## Reference

- [TypeScript Narrowing](https://www.typescriptlang.org/docs/handbook/2/narrowing.html)
- [Zod Documentation](https://zod.dev/)
