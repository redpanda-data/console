---
name: form-refactorer
description: Refactor legacy forms to use modern Redpanda UI Registry Field components with react-hook-form and Zod validation. Use when user requests: (1) Form refactoring or modernization, (2) Converting Chakra UI or @redpanda-data/ui forms, (3) Updating forms to use Field components, (4) Migrating from legacy form patterns, (5) Implementing forms with react-hook-form and Zod validation.
---

# Form Refactorer

Refactor legacy forms to modern Redpanda UI Registry Field components with react-hook-form and Zod validation.

## Core Requirements

### MUST USE (Modern Pattern)

- Field component family from `components/redpanda-ui/components/field`
- react-hook-form for form state management
- Zod for validation schemas via `zodResolver`

### FORBIDDEN (Legacy Patterns)

See [no-legacy](../code-standards/rules/no-legacy.md) for prohibited patterns. Also never import `Form` from `components/redpanda-ui/components/form`.

## Component Hierarchy

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

## Key Patterns

**Vertical field:**
```tsx
<Field data-invalid={!!errors.fieldName}>
  <FieldLabel htmlFor="fieldName">Label</FieldLabel>
  <Input id="fieldName" {...register("fieldName")} aria-invalid={!!errors.fieldName} />
  {errors.fieldName && <FieldError>{errors.fieldName.message}</FieldError>}
</Field>
```

**Horizontal field (switch/checkbox):**
```tsx
<Field orientation="horizontal">
  <Switch id="toggle" {...register("toggle")} />
  <FieldContent>
    <FieldLabel htmlFor="toggle">Enable Feature</FieldLabel>
    <FieldDescription>Description</FieldDescription>
  </FieldContent>
</Field>
```

## Checklist

Before completing refactoring, verify:

- [ ] All legacy form imports removed (Chakra, @redpanda-data/ui, legacy Form)
- [ ] Field components used for all fields
- [ ] FieldLabel has `htmlFor` matching Input `id`
- [ ] Errors show `data-invalid` on Field and `aria-invalid` on Input
- [ ] Yup replaced with Zod + zodResolver
- [ ] FieldSet + FieldLegend used for semantic grouping
- [ ] FieldError conditionally rendered: `{errors.field && <FieldError>...`
- [ ] Form submission handled via react-hook-form `handleSubmit`

## References

- [Common Patterns](references/common-patterns.md) — Dynamic fields, field arrays, multi-section forms, pitfalls, Zod patterns
- [Migration Examples](references/migration-examples.md) — Before/after examples for Chakra/legacy -> modern
- [Field Component Docs](https://redpanda-ui-registry.netlify.app/docs/field)
