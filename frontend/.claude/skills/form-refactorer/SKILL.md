---
name: form-refactorer
description: Refactor legacy forms to use modern Redpanda UI Registry Field components with react-hook-form and Zod validation. Use when user requests: (1) Form refactoring or modernization, (2) Converting Chakra UI or @redpanda-data/ui forms, (3) Updating forms to use Field components, (4) Migrating from legacy form patterns, (5) Implementing forms with react-hook-form and Zod validation.
---

# Form Refactorer

Refactor legacy forms to modern Redpanda UI Registry Field components with react-hook-form and Zod validation.

## Core Requirements

### MUST USE (Modern Pattern)

```tsx
import {
  FieldSet,
  FieldLegend,
  FieldGroup,
  Field,
  FieldLabel,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldSeparator
} from "components/redpanda-ui/components/field";
```

- react-hook-form for form state management
- Zod for validation schemas via `zodResolver`
- Field component family for all form layouts

### FORBIDDEN (Legacy Patterns)

See [no-legacy](../code-standards/rules/no-legacy.md) for prohibited patterns.

```tsx
// ❌ Also never import legacy form components
import { Form } from "components/redpanda-ui/components/form";
```

## Refactoring Workflow

### Step 1: Identify Legacy Patterns

Scan the form file for these indicators:

**Legacy imports to remove:**
- `@chakra-ui/react` form components (FormControl, FormLabel, FormErrorMessage, FormHelperText)
- `@redpanda-data/ui` Form component
- `components/redpanda-ui/components/form` (legacy)
- Yup validation imports

**Legacy patterns to replace:**
- `<FormControl isInvalid={...}>` → `<Field data-invalid={...}>`
- `<FormLabel>` → `<FieldLabel htmlFor="...">`
- `<FormErrorMessage>` → `<FieldError>`
- `<FormHelperText>` → `<FieldDescription>`
- Yup schemas → Zod schemas

### Step 2: Set Up Modern Dependencies

Add required imports:

```tsx
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  FieldSet,
  FieldLegend,
  FieldGroup,
  Field,
  FieldLabel,
  FieldError,
  FieldDescription
} from "components/redpanda-ui/components/field";
```

Create Zod schema replacing Yup:

```tsx
// Replace Yup schema
const schema = z.object({
  name: z.string().min(1, "Name is required"),
  email: z.string().email("Invalid email address"),
  age: z.number().min(18, "Must be 18 or older"),
});

// Use with react-hook-form
const { register, handleSubmit, formState: { errors } } = useForm({
  resolver: zodResolver(schema),
});
```

### Step 3: Restructure Form Layout

Replace legacy structure with Field components:

**Pattern: Simple vertical field**

```tsx
<Field data-invalid={!!errors.fieldName}>
  <FieldLabel htmlFor="fieldName">Field Label</FieldLabel>
  <Input
    id="fieldName"
    {...register("fieldName")}
    aria-invalid={!!errors.fieldName}
  />
  <FieldDescription>Optional helper text</FieldDescription>
  {errors.fieldName && <FieldError>{errors.fieldName.message}</FieldError>}
</Field>
```

**Pattern: Horizontal field (switch/checkbox)**

```tsx
<Field orientation="horizontal">
  <Switch id="toggle" {...register("toggle")} />
  <FieldContent>
    <FieldLabel htmlFor="toggle">Enable Feature</FieldLabel>
    <FieldDescription>This enables the feature</FieldDescription>
  </FieldContent>
</Field>
```

**Pattern: Multiple fields in group**

```tsx
<FieldSet>
  <FieldLegend>Section Title</FieldLegend>
  <FieldDescription>Section description (optional)</FieldDescription>
  <FieldGroup>
    <Field>...</Field>
    <Field>...</Field>
    <FieldSeparator />  {/* Optional visual divider */}
    <Field>...</Field>
  </FieldGroup>
</FieldSet>
```

### Step 4: Handle Validation Errors

Apply error states to both Field and Input:

```tsx
<Field data-invalid={!!errors.email}>
  <FieldLabel htmlFor="email">Email</FieldLabel>
  <Input
    id="email"
    {...register("email")}
    aria-invalid={!!errors.email}  // For assistive technologies
  />
  {errors.email && <FieldError>{errors.email.message}</FieldError>}
</Field>
```

### Step 5: Ensure Accessibility

Required accessibility attributes:

1. **Label association:** Use `htmlFor` on FieldLabel matching Input `id`
2. **Error state:** Add `data-invalid` to Field when error exists
3. **ARIA invalid:** Add `aria-invalid` to Input when error exists
4. **Semantic grouping:** Use FieldSet + FieldLegend for related fields

```tsx
// ✅ Correct accessibility
<Field data-invalid={!!errors.name}>
  <FieldLabel htmlFor="name">Name</FieldLabel>
  <Input id="name" {...register("name")} aria-invalid={!!errors.name} />
  {errors.name && <FieldError>{errors.name.message}</FieldError>}
</Field>
```

## Quick Reference

### Component Hierarchy

```
FieldSet              - Semantic fieldset container for related fields
├─ FieldLegend        - Title for the fieldset
├─ FieldDescription   - Description for entire fieldset
└─ FieldGroup         - Layout wrapper that stacks fields
   ├─ Field           - Individual field wrapper
   │  ├─ FieldLabel       - Label for input (use htmlFor)
   │  ├─ Input/Select/... - Form control
   │  ├─ FieldDescription - Helper text
   │  └─ FieldError       - Error message
   ├─ FieldSeparator  - Visual divider between fields
   └─ Field           - Another field
```

### Common Zod Patterns

```tsx
// String validations
z.string().min(1, "Required")
z.string().email("Invalid email")
z.string().url("Invalid URL")
z.string().regex(/^[A-Z]/, "Must start with capital")

// Number validations
z.number().min(0, "Must be positive")
z.number().max(100, "Max 100")
z.number().int("Must be integer")

// Optional fields
z.string().optional()
z.string().nullable()

// Arrays
z.array(z.string()).min(1, "At least one required")

// Objects
z.object({
  nested: z.string(),
})

// Conditional validation
z.object({
  type: z.enum(["a", "b"]),
  value: z.string(),
}).refine((data) => {
  if (data.type === "a") return data.value.length > 5;
  return true;
}, "Value must be longer than 5 for type A")
```

## Advanced Scenarios

For complex patterns (dynamic fields, field arrays, multi-section forms), see:
- [references/common-patterns.md](references/common-patterns.md) - Detailed patterns for advanced use cases
- [references/migration-examples.md](references/migration-examples.md) - Before/after examples

## Checklist

Before completing refactoring, verify:

- [ ] All legacy form imports removed (Chakra, @redpanda-data/ui, legacy Form)
- [ ] Field components used for all fields
- [ ] FieldLabel has `htmlFor` matching Input `id`
- [ ] Errors show `data-invalid` on Field and `aria-invalid` on Input
- [ ] Yup replaced with Zod + zodResolver
- [ ] FieldSet + FieldLegend used for semantic grouping
- [ ] FieldError conditionally rendered: `{errors.field && <FieldError>...`
- [ ] No inline styling or className for layout (use Field orientation/FieldGroup)
- [ ] Form submission handled via react-hook-form `handleSubmit`

## Documentation

Full Field component documentation: https://redpanda-ui-registry.netlify.app/docs/field
