# Proto Validation Guide for Forms

This guide shows how to integrate proto validation with React Hook Form using the reusable utilities in `form-validation.ts`.

## Overview

We use a **real-time two-phase validation approach**:
1. **Custom validation** (in resolver) - Runs on every form change (`onChange`)
2. **Proto validation** (in resolver) - Runs on every form change (`onChange`)

This approach provides:
- **Real-time validation feedback** - Errors appear as the user types
- **Proto schema validation** - Without maintaining duplicate Zod schemas
- **Type-safe form values** - Excellent DX with TypeScript
- **No validation in submit handler** - Form is always valid when submitted

## Quick Start

### 1. Define Form Values Type

Create a plain TypeScript type for your form values (not proto types directly):

```typescript
// src/components/pages/my-feature/schemas.ts
export type MyFormValues = {
  name: string;
  email: string;
  age: number;
  startDate: string;
  endDate: string;
};

export const initialValues: MyFormValues = {
  name: '',
  email: '',
  age: 0,
  startDate: '',
  endDate: '',
};
```

### 2. Add Custom Validation (Optional)

Create a validation function for cross-field logic:

```typescript
// src/components/pages/my-feature/schemas.ts
import type { ValidationResult } from 'utils/form-validation';

export function validateMyForm(values: MyFormValues): ValidationResult {
  const errors: Record<string, string> = {};

  // Cross-field validation
  if (values.endDate && values.startDate && values.endDate < values.startDate) {
    errors.endDate = 'End date must be after start date';
  }

  // Conditional validation
  if (values.age < 18 && !values.parentEmail) {
    errors.parentEmail = 'Parent email required for users under 18';
  }

  // Regex validation
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (values.email && !emailRegex.test(values.email)) {
    errors.email = 'Invalid email format';
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors,
  };
}
```

### 3. Create Proto Builder Function

Convert form values to proto message:

```typescript
// src/components/pages/my-feature/schemas.ts
import { create } from '@bufbuild/protobuf';
import {
  MyProtoSchema,
  type MyProto,
} from 'protogen/my/api/v1/my_pb';

export function buildMyProtoMessage(values: MyFormValues): MyProto {
  return create(MyProtoSchema, {
    name: values.name,
    email: values.email,
    age: values.age,
    startDate: values.startDate,
    endDate: values.endDate,
  });
}
```

### 4. Setup Form with Real-Time Validation

Use `createFormResolver` with proto builder in your form component:

```typescript
// src/components/pages/my-feature/my-feature-create-page.tsx
import { useForm } from 'react-hook-form';
import { createFormResolver } from 'utils/form-validation';
import { MyProtoSchema } from 'protogen/my/api/v1/my_pb';
import { initialValues, validateMyForm, buildMyProtoMessage } from './schemas';

export const MyFeatureCreatePage = () => {
  // Setup form with real-time custom + proto validation
  const form = useForm({
    resolver: createFormResolver({
      customValidator: validateMyForm,      // Custom cross-field logic
      protoBuilder: buildMyProtoMessage,    // Build proto from form values
      protoSchema: MyProtoSchema,           // Validate proto message
    }),
    defaultValues: initialValues,
    mode: 'onChange', // Enable real-time validation
  });

  const onSubmit = async (values: MyFormValues) => {
    // Validation already done by resolver!
    const protoMessage = buildMyProtoMessage(values);

    // Submit to API
    await myMutation(protoMessage);
    toast.success('Created successfully');
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)}>
        {/* Your form fields */}
      </form>
    </Form>
  );
};
```

## Real-World Example: Knowledge Base Form

See `src/components/pages/knowledgebase/create/` for a complete example:

```typescript
// schemas.ts - Define types and validation
export type KnowledgeBaseCreateFormValues = {
  displayName: string;
  chunkSize: number;
  chunkOverlap: number;
  // ... more fields
};

export function validateFormValues(values: KnowledgeBaseCreateFormValues): ValidationResult {
  const errors: Record<string, string> = {};

  // Chunk overlap must be less than chunk size
  if (values.chunkOverlap >= values.chunkSize) {
    errors.chunkOverlap = 'Chunk overlap must be less than chunk size';
  }

  return { valid: Object.keys(errors).length === 0, errors };
}

// knowledge-base-create-page.tsx - Use in component
const form = useForm<KnowledgeBaseCreateFormValues>({
  resolver: createFormResolver({
    customValidator: validateFormValues,
    protoBuilder: buildKnowledgeBaseCreate,
    protoSchema: KnowledgeBaseCreateSchema,
  }),
  defaultValues: initialValues,
  mode: 'onChange',
});

const onSubmit = async (values: KnowledgeBaseCreateFormValues) => {
  // Validation already done! Just build and submit
  const knowledgeBase = buildKnowledgeBaseCreate(values);
  await createKnowledgeBase(knowledgeBase);
};
```

## When to Use Custom Validation

Use custom validation for:
- **Cross-field validation** - End date after start date, password confirmation
- **Conditional requirements** - Field required based on another field's value
- **Regex patterns** - Email format, phone numbers (unless in proto)
- **Business logic** - Chunk overlap < chunk size, min/max relationships
- **Provider-specific rules** - API key required for selected provider

Proto validation automatically handles:
- Required fields (proto `required` constraint)
- String patterns (proto `pattern` constraint)
- Numeric ranges (proto `gte`, `lte` constraints)
- List lengths (proto `min_items`, `max_items` constraints)
- Message validation (nested proto messages)

## Advanced: Direct Proto Validation

For forms that use proto messages directly as form values (rare):

```typescript
import { createProtoResolver } from 'utils/form-validation';
import { MyProtoSchema } from 'protogen/my/api/v1/my_pb';

const form = useForm({
  resolver: createProtoResolver(MyProtoSchema),
  defaultValues: initialProtoMessage,
});
```

Most forms should use plain form values + `createFormResolver` for better DX.

## Migration from Zod

If you have an existing form with Zod validation:

1. Remove Zod schema
2. Create plain TypeScript type for form values
3. Extract custom validation logic to validation function
4. Use `createFormResolver` with custom validator
5. Add proto validation in submit handler with `validateProtoMessage`

## Testing

```typescript
// Test custom validation
describe('validateMyForm', () => {
  it('should reject end date before start date', () => {
    const values = { ...initialValues, startDate: '2024-01-02', endDate: '2024-01-01' };
    const result = validateMyForm(values);
    expect(result.valid).toBe(false);
    expect(result.errors.endDate).toBeDefined();
  });
});

// Test proto validation
describe('Proto Validation', () => {
  it('should reject invalid table name', () => {
    const proto = create(MyProtoSchema, { table: '123invalid' });
    const validation = validateProtoMessage(MyProtoSchema, proto);
    expect(validation.valid).toBe(false);
  });
});
```

## Benefits

✅ **No schema duplication** - Proto constraints are the single source of truth
✅ **Type safety** - TypeScript types from form values to proto messages
✅ **Real-time feedback** - Custom validation runs on every change
✅ **Reusable pattern** - Same approach for all forms
✅ **Excellent DX** - Plain form values, no proto complexity in forms
✅ **Testable** - Separate validation logic is easy to test
