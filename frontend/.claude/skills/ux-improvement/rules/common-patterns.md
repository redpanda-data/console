---
title: Common Patterns to Look For
impact: MEDIUM
impactDescription: Know where to find schemas, validation, and UX patterns in the codebase
tags: ux, patterns, schema, validation
---

# Common Patterns to Look For

## Backend Schema

| Pattern | Location |
|---------|----------|
| Proto definitions | `app/gen/**/*_pb.ts` |
| Validation annotations | `buf.validate` constraints in protos |
| Field optionality | `optional` keyword in proto |
| Mutually exclusive fields | `oneof` in proto |
| Field dependencies | Comments in proto files |

**What to document:**

- Required vs optional fields
- Field types and constraints
- `oneof` fields (mutually exclusive options)
- Field dependencies (if A is set, B is required)
- Validation messages

## Frontend Schema

| Pattern | Location |
|---------|----------|
| Zod schemas | Component files or `schema.ts` |
| Form state | `useForm()` calls |
| Custom validation | `.superRefine()` in Zod |
| Type definitions | `FormValues` or similar types |

**What to look for:**

```typescript
// Zod schema patterns
z.object({ ... })
z.string().min(1, "Required")
z.refine() / z.superRefine()

// Form patterns
useForm({ resolver: zodResolver(schema) })
formState: { errors }
```

## User Journey

| Pattern | Indicates |
|---------|-----------|
| `Stepper` component | Multi-step wizard |
| `mode: 'onChange'` | Real-time validation |
| `mode: 'onBlur'` | Validation on field exit |
| `mode: 'onSubmit'` | Validation only on submit |
| `isLoading` / `isPending` | Loading states |
| `error` / `isError` | Error states |

**Progressive disclosure patterns:**

```typescript
// Conditional fields
{showAdvanced && <AdvancedOptions />}

// Dependent fields
{authType === 'oauth' && <OAuthFields />}
```

## Common UX Issues to Check

1. **Validation mismatch**: Frontend less strict than backend
2. **Missing inline validation**: Errors only on submit
3. **Generic error messages**: "Invalid input" without specifics
4. **No explanatory text**: Complex fields without help
5. **No progressive disclosure**: Everything visible at once
6. **Inconsistent patterns**: Different from similar features

## Test ID Patterns

Test IDs follow the pattern: `{component}-{element}-{type}`

```typescript
data-testid="gateway-name-input"
data-testid="backend-pool-save-button"
data-testid="route-delete-dialog"
```

Document all test IDs for testability assessment.
