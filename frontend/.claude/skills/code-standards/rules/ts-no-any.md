---
title: No any Type
impact: CRITICAL
impactDescription: any bypasses type checking and hides bugs until runtime
tags: typescript, types, any, strict
---

# No any Type (CRITICAL)

## Explanation

Never use `any` type. It bypasses TypeScript's type checking and hides bugs until runtime. Use `unknown` for truly unknown types and narrow them with type guards.

## Incorrect

```typescript
// any allows anything
function process(data: any) {
  data.foo.bar.baz(); // No error, crashes at runtime
}

// Casting to any
const value = something as any;

// any in generics
const items: Array<any> = [];

// Implicit any from missing types
function handle(event) { // Parameter 'event' implicitly has 'any' type
  console.log(event.target.value);
}
```

## Correct

```typescript
// Use unknown for truly unknown data
function process(data: unknown) {
  if (typeof data === 'object' && data !== null && 'foo' in data) {
    // Now TypeScript knows data has foo
  }
}

// Define proper types
interface EventData {
  target: { value: string };
}

function handle(event: EventData) {
  console.log(event.target.value);
}

// Use generics for flexible but type-safe code
function identity<T>(value: T): T {
  return value;
}

// Use type predicates for narrowing
function isString(value: unknown): value is string {
  return typeof value === 'string';
}
```

## When any Seems Necessary

| Situation | Solution |
|-----------|----------|
| Third-party lib | Create type definitions or use `@types/*` |
| Complex object | Define interface incrementally |
| Generic callback | Use proper generic types |
| JSON parsing | Use `unknown` and validate |

## Reference

- [TypeScript unknown vs any](https://www.typescriptlang.org/docs/handbook/2/narrowing.html)
