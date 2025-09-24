# AI Coding Rules & Standards

---

**name**: Redpanda UI Registry  
**when**: Whenever a user wants to build a UI or requests code examples or documentation for the Redpanda UI Registry (or design system or UI library)  
**actions**:

- mcp: use context7 /websites/redpanda-ui-registry_netlify_app

---

## Redpanda UI Registry Directive

**This file provides guidance for building UIs using the Redpanda UI Registry.**

### Workflow Process

1. **Invoke MCP**: Use `context7 /websites/redpanda-ui-registry_netlify_app` to access registry documentation
2. **Component Research**: Access both the registry itself and documentation for component examples
3. **Component Selection**: Based on user prompt, determine required UI components
4. **Installation**: Install required components and dependencies using registry CLI
5. **Manual Dependencies**: If CLI doesn't install dependencies, manually install them
6. **Implementation**: Apply registry best practices when creating UIs
7. **Testing**: Create unit tests following consumer app's testing practices
8. **Validation**: Ensure tests pass and no build/runtime errors exist

### Registry Best Practices

- **Never modify** files in the directory specified in `cli.json` `baseDir`
- **Installation Command**: Use `bunx @fumadocs/cli add --dir https://redpanda-ui-registry.netlify.app/r component1 component2`
- **Component Priority**: Use Registry components over external libraries unless explicitly requested
- **No Copy/Paste**: Always install using CLI, never copy/paste source code
- **Styling Approach**: Rely on component variants and exposed props, not custom `className`
- **No Style Prop**: Never use `style` prop, use `className` instead
- **Spacing Pattern**: Don't add margin `className`s to Registry components, wrap in `div` with padding
- **Responsive Design**: UIs should be responsive and follow accessibility best practices

## React Best Practices

### Core Principles

- Always use functional React components, never class-based
- Never cast or type variables as `any`, instead deduce the correct type
- Don't leave comments or `console.log`s in generated code, keep it clean and production-ready
- `forwardRef` components when applicable
- Avoid adding unnecessary `div`s, prefer fragments when reasonable

### 🚀 Performance Optimizations

#### Hoisting Rules

- **Constants**: Move all constants outside component body to prevent recreation on each render

  ```typescript
  // ✅ Good - hoisted
  const DEFAULT_VALUES = { name: "", age: 0 } as const;
  const FORM_DEFAULTS = { topicName: "", partitions: 1 } as const;

  // ❌ Bad - recreated on each render
  const MyComponent = () => {
    const defaultValues = { name: "", age: 0 };
  };
  ```

- **Pure Functions**: Hoist functions that don't depend on props/state outside the component

  ```typescript
  // ✅ Good - hoisted pure function
  const validateInput = (input: string) => input.length > 0;
  const isUsingDefaults = (data: FormData) => data.value === DEFAULT_VALUE;

  const MyComponent = () => {
    // ❌ Bad - recreated on each render
    const validateInput = (input: string) => input.length > 0;
  };
  ```

- **Helper Functions**: Move utility functions to separate files or hoist outside component
- **Type Definitions**: Define interfaces and types outside component body

#### Memoization Guidelines

- **useMemo**: Use for expensive computations that depend on specific values

  ```typescript
  // ✅ Good - expensive computation
  const expensiveValue = useMemo(
    () => largeDataSet.filter((item) => item.category === selectedCategory),
    [largeDataSet, selectedCategory]
  );

  // ❌ Bad - simple reference
  const simpleValue = useMemo(() => props.value, [props.value]);
  ```

- **memo**: Wrap components that receive props and render frequently

  ```typescript
  // ✅ Good - component re-renders frequently with same props
  const ExpensiveComponent = memo(({ data, onAction }) => {
    return <ComplexUI data={data} onAction={onAction} />;
  });
  ```

- **useCallback**: Only when preventing expensive recalculations or stabilizing refs

  ```typescript
  // ✅ Good - stabilizing ref for expensive child
  const handleSubmit = useCallback(
    async (data) => {
      await expensiveApiCall(data);
    },
    [expensiveApiCall]
  );

  // ❌ Bad - simple handler
  const handleClick = useCallback(() => setCount((c) => c + 1), []);
  ```

### 📝 Code Cleanliness

- **No console.log**: Remove console.log statements unless explicitly requested for debugging
- **Minimal Comments**: Only comment when logic is non-obvious and requires context
- **Remove TODO Comments**: Address TODOs immediately or remove them if already addressed

### 🔄 Form & State Management

#### Redpanda UI Form Patterns

- **SimpleFormField Pattern**: Use for simple, clean forms with standard inputs

  ```typescript
  // ✅ Good - SimpleFormField for straightforward cases
  import {
    Form,
    SimpleFormField,
    SubmitButton,
  } from "@/components/redpanda-ui/form";

  function MyForm() {
    return (
      <Form onSubmit={(values) => handleSubmit(values)}>
        <SimpleFormField
          label="Username"
          name="username"
          type="text"
          placeholder="Enter username"
          required
        />
        <SimpleFormField
          label="Email"
          name="email"
          type="email"
          placeholder="your@email.com"
        />
        <SubmitButton>Submit</SubmitButton>
      </Form>
    );
  }
  ```

- **FormField Pattern**: Use when you need explicit control or custom components

  ```typescript
  // ✅ Good - FormField for explicit control and custom components
  import {
    Form,
    FormField,
    FormItem,
    FormLabel,
    FormControl,
    FormMessage,
  } from "@/components/redpanda-ui/form";

  <FormField
    control={form.control}
    name="topicName"
    render={({ field }) => (
      <FormItem>
        <FormLabel>Topic Name</FormLabel>
        <FormControl>
          <Combobox
            {...field}
            options={topicOptions}
            creatable
            onCreateOption={(value) => {
              setTopicOptions([...topicOptions, { value, label: value }]);
            }}
          />
        </FormControl>
        <FormMessage />
      </FormItem>
    )}
  />;
  ```

- **AutoForm Pattern**: Use for rapid form generation from Zod schemas

  ```typescript
  // ✅ Good - AutoForm for schema-driven forms
  import { AutoForm } from "@/components/redpanda-ui/auto-form";

  const schema = z.object({
    username: z.string().min(2),
    email: z.string().email(),
    favoriteNumber: z.number().optional(),
  });

  export default function MyForm() {
    return <AutoForm schema={schema} />;
  }
  ```

- **CardForm Pattern**: Use for organized form layouts within cards

  ```typescript
  // ✅ Good - CardForm for structured layouts
  import {
    Card,
    CardContent,
    CardForm,
    CardField,
  } from "@/components/redpanda-ui/card";

  <Card>
    <CardContent>
      <CardForm>
        <CardField>
          <Label>Name</Label>
          <Input />
        </CardField>
        <CardField>
          <Label>Email</Label>
          <Input />
        </CardField>
      </CardForm>
    </CardContent>
  </Card>;
  ```

#### React Hook Form Foundation

- **Still Use**: `useForm` from `react-hook-form` with `zodResolver` as the foundation
- **Installation**: Ensure dependencies: `react-hook-form ^7.62.0`, `@hookform/resolvers ^5.1.1`, `zod ^3.24.1`

- **Consolidate Effects**: Combine related `useEffect` hooks to reduce complexity

  ```typescript
  // ✅ Good - single effect handling related logic
  useEffect(() => {
    if (topicList?.topics) {
      setTopicOptions(
        topicList.topics.map((t) => ({ value: t.name, label: t.name }))
      );
    }

    const populateConfig = (name: string) => {
      const topic = topicList?.topics?.find((t) => t.name === name);
      if (topic) {
        form.setValue("partitions", topic.partitions);
        form.setValue("replication", topic.replication);
      }
    };

    const subscription = form.watch((value, { name }) => {
      if (name === "topicName") populateConfig(value.topicName);
    });

    return subscription.unsubscribe;
  }, [form, topicList?.topics]);

  // ❌ Bad - multiple separate effects
  useEffect(() => {
    /* set options */
  }, [topicList]);
  useEffect(() => {
    /* watch form */
  }, [form]);
  useEffect(() => {
    /* populate config */
  }, [selectedTopic]);
  ```

- **Derived State**: Use `useMemo` for computed values instead of separate state
- **State Colocation**: Keep state as close to where it's used as possible
- **Zustand Patterns**: Use stores for cross-component state, not React state

### 🏗 Architecture Patterns

- **Constants Files**: Create dedicated constants files for shared values
- **Pure Functions**: Prefer pure functions for testability and performance
- **Single Responsibility**: Each function/component should have one clear purpose

## Code Quality Standards

### TypeScript

- **Strict Types**: No `any` types - always specify proper types
- **Const Assertions**: Use `as const` for readonly objects and arrays
- **Return Types**: Explicitly type function return values for complex functions

### React Patterns

- **Component Composition**: Prefer composition over complex prop drilling

  ```typescript
  // ✅ Good - composition
  <FormProvider value={form}>
    <FormFields />
    <FormActions />
  </FormProvider>

  // ❌ Bad - prop drilling
  <FormComponent
    form={form}
    onSubmit={onSubmit}
    validation={validation}
    errors={errors}
  />
  ```

- **Ref Usage**: Use `useImperativeHandle` appropriately for child component APIs

  ```typescript
  // ✅ Good - exposing child API
  const ChildComponent = forwardRef<ChildRef>((props, ref) => {
    useImperativeHandle(ref, () => ({
      triggerSubmit: async () => {
        const isValid = await form.trigger();
        return isValid ? handleSubmit(form.getValues()) : false;
      },
      isLoading: mutation.isPending,
    }));
  });
  ```

- **Early Returns**: Use early returns to avoid unnecessary computations and nested conditionals

  ```typescript
  // ✅ Good - early returns
  const MyComponent = ({ data, isLoading }) => {
    if (isLoading) return <LoadingSpinner />;
    if (!data) return <EmptyState />;
    if (data.error) return <ErrorState error={data.error} />;

    return <DataView data={data} />;
  };
  ```

- **Conditional Rendering**: Prefer logical AND for simple conditionals, ternary for either/or

  ```typescript
  // ✅ Good - logical patterns
  {
    isVisible && <Component />;
  }
  {
    isLoading ? <Spinner /> : <Content />;
  }

  // ❌ Bad - complex nested ternaries
  {
    isLoading ? <Spinner /> : data ? <Content /> : error ? <Error /> : null;
  }
  ```

### Error Handling

- **Graceful Failures**: Always handle potential errors in async operations
- **User Feedback**: Provide clear error messages for user-facing failures
- **Type Safety**: Use proper error types instead of `unknown`

## File Organization

### Structure

```
components/
├── pages/
│   └── feature/
│       ├── components/
│       ├── hooks/
│       ├── utils/
│       ├── constants.ts
│       └── types.ts
```

### Naming

- **Components**: PascalCase (e.g., `MyComponent`)
- **Functions**: camelCase (e.g., `handleSubmit`)
- **Constants**: UPPER_SNAKE_CASE (e.g., `DEFAULT_TIMEOUT`)
- **Files**: kebab-case for utilities, PascalCase for components

## Import/Export Standards

### Order

1. React imports
2. Third-party libraries
3. Internal utilities/types
4. Relative imports (components, hooks)

### Style

```typescript
// ✅ Good - grouped and ordered
import { useEffect, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { api } from "state/backendApi";
import { MyComponent } from "./MyComponent";

// ❌ Bad - mixed and unordered
import { MyComponent } from "./MyComponent";
import { useState } from "react";
import { api } from "state/backendApi";
```

## Performance Considerations

### 🚫 Avoid

- Creating objects/functions in render
- Unnecessary re-renders due to inline objects/functions
- Complex computations in render without memoization
- Deep object comparisons in effects without proper dependencies
- Premature memoization of simple values
- Using `useCallback` for every function
- Multiple `useEffect` hooks that could be combined

### ✅ Prefer

- Hoisted constants and pure functions outside component body
- Proper dependency arrays in effects (exhaustive-deps)
- Memoization for expensive calculations only
- Early returns to avoid unnecessary computations
- Single consolidated effects for related logic
- Derived state with `useMemo` instead of separate state
- Component memoization for frequently re-rendering components

## API & Data Fetching

### TanStack Query Patterns

- Use query hooks for GET operations: `useTopicsQuery`, `useUserQuery`
- Use mutation hooks for POST/PUT/DELETE: `useCreateTopicMutation`
- Leverage query invalidation for cache updates
- Use optimistic updates for better UX where appropriate

### Error Handling

- Always handle loading and error states in components
- Provide meaningful error messages to users
- Use error boundaries for component-level error handling
- Graceful degradation for non-critical features

## Redpanda UI Registry Components

### Form Component Hierarchy

```
Form (Root): Main form container with react-hook-form provider
├── SimpleFormField: Simplified field wrapper (for standard inputs)
├── FormField: Explicit field wrapper with render prop (for custom components)
├── AutoForm: Schema-driven form generation
├── CardForm: Structured form within cards
└── Form validation: Automatic with Zod schemas
```

### Component Installation

- **CLI Command**: `bunx @fumadocs/cli add --dir https://redpanda-ui-registry.netlify.app/r form card input button`
- **Multiple Components**: Space-separated in single command
- **Dependencies**: CLI handles installation automatically
- **Never Copy/Paste**: Always use CLI installation

### Layout Components

- **CreateLayout**: For resource creation UIs with header/content/summary structure
- **Card**: For grouping related form sections
- **FormSection**: For organizing form fields within sections
- **CardForm/CardField**: Automatic grid layout for form elements

### Input Components Integration

- **Input**: Basic text inputs with validation integration
- **Select**: Dropdown selection with form binding
- **Textarea**: Multi-line text input
- **Checkbox/Switch**: Boolean inputs
- **DatePicker**: Date selection with calendar
- **Choicebox**: Radio-style selection groups

### Styling Standards

- **Variants Over Classes**: Use component `variant` props instead of custom `className`
- **No Style Prop**: Never use `style`, always `className`
- **Spacing Rule**: No margin classes on Registry components, wrap with padding `div`
- **Responsive**: All UIs must be responsive and accessible
- **Tailwind**: Use for additional styling needs only

---

_These rules help maintain consistent, performant, and maintainable code across the project._
