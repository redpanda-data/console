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
<Button className="bg-blue-500 hover:bg-blue-600 text-white">
  Click
</Button>

// Overriding size with className
<Button className="px-8 py-4 text-lg">
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

| Component | Variants | Sizes |
|-----------|----------|-------|
| Button | `default`, `destructive`, `outline`, `secondary`, `ghost`, `link` | `default`, `sm`, `lg`, `icon` |
| Badge | `default`, `secondary`, `destructive`, `outline` | - |
| Alert | `default`, `destructive` | - |

## When className is Acceptable

- Width constraints: `className="w-full"`
- Layout positioning when wrapped is impractical
- One-off situations documented with comments

## Reference

- https://redpanda-ui-registry.netlify.app
