---
title: Use Component Variants
impact: HIGH
impactDescription: Using className overrides breaks design consistency and component updates
tags: styling, variants, props, design-system
---

# Use Component Variants (HIGH)

## Explanation

Registry components expose variant props for customization. Use these instead of className overrides. Variants ensure design consistency and allow components to update without breaking custom styles.

## Incorrect

```tsx
// Overriding colors with className
<Button className="bg-surface-informative hover:bg-surface-informative-hover text-informative-foreground">
  Click
</Button>

// Overriding size with className
<Button className="px-8 py-4 text-heading-md">
  Click
</Button>

// Inline styles
<Button style={{ backgroundColor: 'blue' }}>
  Click
</Button>
```

## Correct

```tsx
// Use variant props
<Button variant="primary" size="lg">
  Click
</Button>

// Use semantic variants
<Button variant="destructive">
  Delete
</Button>

// Combine with allowed props
<Button variant="outline" disabled>
  Click
</Button>
```

## Common Variant Props

Read the `cva` block in the component rather than trusting a list — these move. As of registry v3:

| Component | Variants | Sizes |
|-----------|----------|-------|
| Button | `primary`, `secondary`, `accent`, `destructive`, `inverse`, `link`, `dashed`, plus `-outline` and `-ghost` forms of `secondary`/`accent`/`destructive`/`current`, and bare `outline`/`ghost` | `xs`, `sm`, `md`, `lg`, `icon-xs`, `icon-sm`, `icon`, `icon-lg` |
| Badge | `neutral`, `simple`, `primary`, `secondary`, `accent`, `destructive`, `success`, `warning`, `info`, `disabled`, `ghost`, `link`, `outline`, each tone also as `-inverted` / `-outline` | `sm`, `md`, `lg` |
| Alert | `info`, `success`, `warning`, `destructive` | - |

`inverse-outline` and `inverse-ghost` were removed in v3 — use `current-outline` / `current-ghost`,
which take their colour from the surrounding text.

## When className is Acceptable

- Width constraints: `className="w-full"`
- Layout positioning when wrapped is impractical
- One-off situations documented with comments

## Reference

- https://redpanda-ui-registry.netlify.app
