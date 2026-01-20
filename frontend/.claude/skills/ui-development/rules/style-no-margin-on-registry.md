---
title: No Margin on Registry Components
impact: HIGH
impactDescription: Direct margin classes break component encapsulation and cause layout inconsistencies
tags: styling, margin, layout, tailwind
---

# No Margin on Registry Components (HIGH)

## Explanation

Registry components should not have margin classes applied directly. Margins are layout concerns that belong to the parent component. Adding margins directly to registry components breaks component encapsulation and makes layouts unpredictable.

## Incorrect

```tsx
// Direct margin on registry component
<Button className="mt-4">Click me</Button>

// Multiple margin classes
<Card className="mt-4 mb-2 mx-auto">Content</Card>

// Margin mixed with other classes
<Input className="mt-2 w-full" />
```

## Correct

```tsx
// Wrap for spacing
<div className="mt-4">
  <Button>Click me</Button>
</div>

// Use layout containers
<div className="space-y-4">
  <Card>Content 1</Card>
  <Card>Content 2</Card>
</div>

// Flex gap for consistent spacing
<div className="flex flex-col gap-4">
  <Input />
  <Button>Submit</Button>
</div>
```

## Allowed Classes on Registry Components

- **Sizing**: `w-full`, `max-w-md`
- **Variants**: Use component props instead
- **State**: Component handles internally

## Reference

- Tailwind CSS spacing: https://tailwindcss.com/docs/margin
