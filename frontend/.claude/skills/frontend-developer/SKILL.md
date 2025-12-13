---
name: frontend-developer
description: "Build user interfaces using Redpanda UI Registry components with React, TypeScript, and Vitest testing. Use when user requests UI components, pages, forms, or mentions 'build UI', 'create component', 'design system', 'frontend', or 'registry'."
allowed-tools: Read, Write, Edit, Bash, Glob, Grep, mcp__ide__getDiagnostics
---

# Frontend UI Development

Build UIs using the Redpanda UI Registry design system following this repo's patterns.

## Critical Rules

**ALWAYS:**

- Fetch registry docs FIRST: Invoke `mcp__context7__get-library-docs` with library `/websites/redpanda-ui-registry_netlify_app`
- Use registry components from `src/components/redpanda-ui/`
- Install components via CLI: `yes | bunx @fumadocs/cli add --dir https://redpanda-ui-registry.netlify.app/r <component>`
- Use functional React components with TypeScript
- Run `bun i --yarn` after installing packages

**NEVER:**

- Use deprecated `@redpanda-data/ui` or Chakra UI
- Modify files in registry base directory (check `cli.json`)
- Copy/paste registry source code
- Add margin `className` directly to registry components
- Use inline `style` prop on registry components
- Leave `console.log` or comments in code

## Workflow

### 1. Fetch Registry Documentation

```bash
# REQUIRED FIRST STEP
Invoke: mcp__context7__get-library-docs
Library: /websites/redpanda-ui-registry_netlify_app
```

### 2. Install Components

```bash
# Single component
yes | bunx @fumadocs/cli add --dir https://redpanda-ui-registry.netlify.app/r button

# Multiple components (space-separated)
yes | bunx @fumadocs/cli add --dir https://redpanda-ui-registry.netlify.app/r card dialog form

# Then generate yarn.lock
bun i && bun i --yarn
```

### 3. Write Component

**Structure:**

```typescript
// Functional component with explicit types
interface Props {
  title: string;
  onSubmit: (data: FormData) => void;
}

export function MyComponent({ title, onSubmit }: Props) {
  // Component logic
}
```

**Styling:**

```typescript
// ✅ CORRECT: Use component variants
<Button variant="primary" size="lg">Click</Button>

// ✅ CORRECT: Wrap for spacing
<div className="mt-4">
  <Button variant="primary">Click</Button>
</div>

// ❌ WRONG: Direct margin on component
<Button className="mt-4" variant="primary">Click</Button>
```

**TypeScript:**

- Define prop interfaces
- Never use `any` - infer correct types
- Use generics for collections

**Performance:**

- Hoist static content outside component
- Use `useMemo` for expensive computations - but only when there's a noticeable performance impact
- Use `memo` for components receiving props

### 4. Write Tests

**Test types:**

- Unit tests (`.test.ts`): Pure logic, utilities, helpers - Node environment
- Integration tests (`.test.tsx`): React components, UI interactions - JSDOM environment

**Unit test example:**

```typescript
// utils.test.ts
import { formatNumber } from "./utils";

describe("formatNumber", () => {
  test("should format numbers with commas", () => {
    expect(formatNumber(1000)).toBe("1,000");
  });
});
```

**Integration test example:**

```typescript
// component.test.tsx
import { render, screen, fireEvent, waitFor } from 'test-utils';
import { createRouterTransport } from '@connectrpc/connect';
import { createPipeline } from 'protogen/redpanda/api/console/v1alpha1/pipeline-PipelineService_connectquery';
import { MyComponent } from './component';

describe('MyComponent', () => {
  test('should trigger gRPC mutation when form is submitted', async () => {
    // Mock the gRPC service method
    const mockCreatePipeline = vi.fn(() =>
      Promise.resolve({ id: '123', name: 'test-pipeline' })
    );

    // Create a mocked transport
    const transport = createRouterTransport(({ rpc }) => {
      rpc(createPipeline, mockCreatePipeline);
    });

    // Render with the mocked transport
    render(<MyComponent />, { transport });

    // Fill out the form
    fireEvent.change(screen.getByLabelText('Pipeline Name'), {
      target: { value: 'test-pipeline' }
    });

    // Submit the form
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));

    // Verify the mutation was called with correct data
    await waitFor(() => {
      expect(mockCreatePipeline).toHaveBeenCalledWith({
        name: 'test-pipeline'
      });
    });
  });
});
```

**Mocking:**

```typescript
vi.mock("module-name", async (importOriginal) => {
  const actual = await importOriginal<typeof import("module-name")>();
  return {
    ...actual,
    functionToMock: vi.fn(),
  };
});

const mockFunction = vi.mocked(functionToMock);
```

### 5. Validation

```bash
# Run in order
bun run type:check            # TypeScript errors
bun run test                  # All tests
bun run lint                  # Code quality
bun run build                 # Production build
bun run start2 --port=3004    # Dev server - check browser
```

**Success criteria:**

- ✓ No TypeScript errors
- ✓ All tests passing
- ✓ No lint errors
- ✓ Build succeeds
- ✓ No runtime errors in browser

## Testing Commands

```bash
bun run test                 # All tests (unit + integration)
bun run test:unit            # Unit tests only (.test.ts)
bun run test:integration     # Integration tests only (.test.tsx)
bun run test:watch           # Watch mode
bun run test:coverage        # Coverage report
```

## Common Patterns

### Registry Component Usage

Check `src/components/redpanda-ui/` for installed components before installing new ones.

Use component variants instead of custom styling:

```typescript
<Button variant="primary" size="lg" />
<Card variant="outline" />
<Dialog size="md" />
```

### Form Patterns

For complex forms, use React Hook Form + Zod:

```typescript
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

const schema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
});

const form = useForm({
  resolver: zodResolver(schema),
  defaultValues: { name: "", email: "" },
});
```

For simple forms, use AutoForm:

```typescript
import { AutoForm } from '@autoform/react';
import { ZodProvider } from '@autoform/zod';

<AutoForm
  schema={schema}
  onSubmit={handleSubmit}
  provider={ZodProvider}
/>
```

### Reusable Sub-Components

Create sub-components in the same file when logic repeats:

```typescript
export function FeatureComponent() {
  return (
    <div>
      <FeatureHeader />
      <FeatureContent />
    </div>
  );
}

// Colocated sub-components
function FeatureHeader() { /* ... */ }
function FeatureContent() { /* ... */ }
```

## Testing Best Practices

**File naming:**

- `.test.ts` for utilities and pure functions (unit tests)
- `.test.tsx` for React components (integration tests)

**Mock location:**

- Use pre-configured mocks from `src/test-utils/`
- Mock external dependencies, not internal code

**Render utility:**

- Import from `test-utils/test-utils.tsx` for component tests
- Includes all providers (React Query, Router, Auth0)

**Async testing:**

- Use `waitFor` for async operations
- Test loading and error states
- Verify state updates

## Quick Reference

**Check before installing:**

```bash
# Check if component exists
ls src/components/redpanda-ui/components/
```

**Multi-component install:**

```bash
yes | bunx @fumadocs/cli add --dir https://redpanda-ui-registry.netlify.app/r \
  button card dialog form input label select
```

**After package install:**

```bash
bun i && bun i --yarn  # ALWAYS run this
```

**Testing shortcuts:**

- Unit test: Pure function? Use `.test.ts`
- Integration test: React component? Use `.test.tsx`
- Mock external: Add to `src/test-utils/`
- Custom render: Use `test-utils/test-utils.tsx`

## Output

After completing work:

1. Confirm all validation steps passed
2. Summarize what was built
3. Note any runtime checks needed in browser
4. Mention test coverage if relevant
