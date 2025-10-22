# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is the frontend for Redpanda Console, a web application for managing Kafka/Redpanda clusters. Built with React 18.3 + TypeScript using Rsbuild (Rspack-based bundler).

## Commands

### Package Management

**IMPORTANT**: Always use `bun` as the package manager. After installing packages, run `bun i --yarn` to generate `yarn.lock` for Snyk security tracking.

```bash
bun install              # Install dependencies
bun i --yarn             # Generate yarn.lock for Snyk tracking
bun add <package>        # Add a new dependency
bun add -d <package>     # Add a dev dependency
```

### Development

```bash
bun start                # Start dev server on http://localhost:3000
bun start2 --port=3004   # Start with additional features enabled (SINGLE_SIGN_ON, REASSIGN_PARTITIONS)
```

The dev server proxies API requests to `http://localhost:9090` for `/api`, `/redpanda.api`, `/auth`, `/logout`.

### Testing

```bash
bun run test             # Run unit and integration tests (Vitest)
bun run e2e-test         # Run E2E tests with Playwright
bun run e2e-test:ui      # Run E2E tests with Playwright (UI mode)
bun run install:chromium # Install Chromium for Playwright
```

**Testing Strategy:**

1. # **Vitest Tests** (Unit + Integration) - Fast, cheap to run

- Test CRUD operations and business logic
- Verify gRPC Connect transport endpoints are called correctly
- Test data fetching, mutations, and state management
- **DO NOT** extensively test component rendering
- **DO NOT** test UI components themselves (they're tested in the UI registry repo)
- Test files: `src/**/*.test.ts`, `src/**/*.test.tsx` (co-located with source files)

2. **Playwright E2E Tests** - Complex scenarios
   - Test browser behaviors and interactions
   - Test sophisticated multi-step workflows
   - Test real user journeys across multiple pages
   - Use when you need actual browser rendering and navigation
   - Test files:
     - `tests/console/*.spec.ts` - Core console features
     - `tests/console-enterprise/*.spec.ts` - Enterprise-exclusive features

**What to Test:**

✅ **Integration Tests (Bun):**

- API calls are made with correct parameters
- gRPC Connect transport endpoints are invoked
- Data transformations and business logic
- State updates after API responses
- Error handling and edge cases

❌ **Don't Test (Components tested in UI registry):**

- Button clicks render correctly
- Dialog opens/closes
- Form fields are styled properly
- Component props work as expected

**Writing E2E Tests**
Recording, Transcript

**Initial setup**:

1. If running the first time, navigate to `tests/e2e-ui` inside the cloudv2 monorepo and run `bun install` && `bunx playwright install` . This will take care of installing all browsers/dependencies on your local machine
2. To get the secrets required for running e2e tests locally, please ask @Beniamin Malinski (BST, London) for 1password link
3. Add the secrets to `.env` file under `tests/e2e-ui`

**Checklist**:

1. Run all the tests:`bunx playwright test --update-snapshots`
2. Run a single test: `bunx playwright test namespace.spec.ts --update-snapshots` (replace spec file name)
3. Use UI mode: `bunx playwright test namespace.spec.ts --update-snapshots --ui` (replace spec file name)
4. Generate test code: `bunx playwright codegen https://dev--redpanda-cloud.netlify.app/` (can use localhost:3000 or any other port too)

**What to look out for**:

- If you change UI components, please make sure to add `testId` attributes, these are sometimes enforced by the Redpanda UI library to make writing and maintaining tests easier.
- If you modify navigation between pages, please run e2e tests locally if possible since the tests will require an additional step. If the UX becomes more complex, the tests will follow, and the same applies if we make the experience more seamless to the user - the tests should flow naturally

### Code Quality

```bash
bun run type:check       # TypeScript type checking (tsc --noEmit)
bun run lint             # Run Biome linter and auto-fix
bun run lint:check       # Check linting without fixing
bun run format           # Format code with Biome
```

### Building

```bash
bun run build            # Production build (output to /build)
bun run preview          # Preview production build
bun run analyze          # Build with bundle analyzer (RSDOCTOR=true)
```

## Architecture

### Technology Stack - Legacy vs Modern

⚠️ **IMPORTANT**: This codebase is in transition. Use modern patterns for all new code.

#### ❌ LEGACY (Do Not Use for New Features)

- **`@redpanda-data/ui` package** - Legacy Chakra UI-based component library, being migrated away from
- **Chakra UI** - Old UI library, being phased out
- **MobX** - Old state management with decorators and class components
- **Class components** - Old React pattern
- **Decorator pattern** - Old TypeScript pattern (`@observable`, `@action`, etc.)
- **Yup** - Old validation library, use Zod or protovalidate-es instead
- **Jest** - Old test runner

#### ✅ MODERN (Use for All New Code)

- **Redpanda UI Registry** (`src/components/redpanda-ui/`) - New Tailwind-based shadcn component library
- **Tailwind CSS v4** - For styling (minimal usage in business logic components)
- **Functional components** - React 18.3 hooks pattern
- **Local state** - `useState`, `useReducer` for component state
- **Zustand** - For global state management (when needed)
- **Vitest** - For unit and integration tests (CRUD, API calls)
- **Playwright** - For E2E tests (complex browser scenarios)
- **React Hook Form** - For form management (complex forms)
- **AutoForm** - For simple forms without custom components
- **Zod** or **protovalidate-es** - For schema validation (NOT Yup)

### Directory Structure

```
src/
├── components/
│   ├── pages/              # Feature pages (routes)
│   │   ├── topics/         # Topic management
│   │   ├── consumers/      # Consumer groups
│   │   ├── remote-mcp/     # MCP server management
│   │   ├── rp-connect/     # Redpanda Connect pipelines
│   │   └── ...
│   ├── redpanda-ui/        # ✅ Modern shadcn-based component library
│   │   ├── components/     # shadcn components (Button, Dialog, etc.)
│   │   ├── lib/            # Utilities (cn, hooks)
│   │   └── style/          # Shared styles
│   ├── ui/                 # Legacy UI components
│   ├── layout/             # Layout components
│   └── form/               # Legacy form components
├── state/                  # ❌ Legacy MobX stores (do not expand)
│   ├── backendApi.ts       # Main API client (MobX, 108KB+)
│   └── ...
├── react-query/            # ✅ React Query hooks for API calls
│   └── api/                # Query definitions
├── hooks/                  # Custom React hooks
├── utils/                  # Utility functions
├── protogen/               # Auto-generated protobuf code (DO NOT EDIT)
└── config.ts              # App configuration
```

### Component Guidelines

**Philosophy: Separation of Business Logic and Styling**

🎯 **GOAL**: Keep business logic components clean by minimizing CSS/className usage. Push styling concerns into:

- **Layout components** - Handle page structure and spacing
- **Redpanda UI Registry components** - Encapsulate reusable styled components

**For New Features:**

1. **Minimize Styling in Business Logic Components:**

   ```tsx
   // ✅ EXCELLENT - Business logic component with minimal styling
   export const UserListPage = () => {
     const { data, isLoading } = useQuery(...);

     return (
       <PageLayout>
         <PageHeader title="Users" />
         <UserList users={data} loading={isLoading} />
       </PageLayout>
     );
   };

   // ✅ GOOD - Component logic, styling delegated to UI components
   export const UserList = ({ users, loading }: Props) => {
     return (
       <DataTable
         data={users}
         columns={columns}
         isLoading={loading}
       />
     );
   };

   // ❌ BAD - Business logic mixed with heavy styling
   export const UserListPage = () => {
     const { data } = useQuery(...);
     return (
       <div className="flex flex-col w-full h-full p-8 gap-6 bg-gray-50">
         <div className="flex items-center justify-between border-b pb-4">
           <h1 className="text-2xl font-bold">Users</h1>
           {/* ... lots of className styling ... */}
         </div>
         {/* ... more inline styling ... */}
       </div>
     );
   };
   ```

2. **Use Redpanda UI Registry Components:**

   ```tsx
   // ✅ GOOD - New Redpanda UI Registry (Tailwind-based)
   import { Button } from "components/redpanda-ui/components/button";
   import { Dialog } from "components/redpanda-ui/components/dialog";
   import { Card } from "components/redpanda-ui/components/card";

   // ❌ BAD - Legacy @redpanda-data/ui package (Chakra-based)
   import { Button, Modal } from "@redpanda-data/ui";

   // ❌ BAD - Chakra UI directly
   import { Button } from "@chakra-ui/react";
   ```

3. **Create Reusable UI Components Instead of Inline Styling:**

   ```tsx
   // ✅ GOOD - Create a new component in redpanda-ui registry
   // File: src/components/redpanda-ui/components/page-header.tsx
   export const PageHeader = ({ title, actions }: Props) => {
     return (
       <div className="flex items-center justify-between border-b pb-4 mb-6">
         <h1 className="text-2xl font-bold">{title}</h1>
         {actions && <div className="flex gap-2">{actions}</div>}
       </div>
     );
   };

   // Then use it without styling concerns:
   <PageHeader title="My Page" actions={<Button>Add</Button>} />

   // ❌ BAD - Inline styling in business logic component
   <div className="flex items-center justify-between border-b pb-4 mb-6">
     <h1 className="text-2xl font-bold">My Page</h1>
     <div className="flex gap-2"><Button>Add</Button></div>
   </div>
   ```

4. **Use Functional Components:**

   ```tsx
   // ✅ GOOD - Functional component
   export const MyComponent = ({ prop }: Props) => {
     const [state, setState] = useState(initialValue);
     return <div>...</div>;
   };

   // ❌ BAD - Class component with decorators
   @observer
   class MyComponent extends React.Component {
     @observable state = initialValue;
   }
   ```

5. **State Management:**

   Prefer local state (`useState`) for component-specific data. Use Zustand only for global or persisted state. Never use MobX for new code.

   See the [State Management](#state-management) section for comprehensive guidance on when and how to use each approach.

6. **Forms:**

   ```tsx
   // ✅ EXCELLENT - AutoForm for simple forms (no custom components needed)
   import { AutoForm } from "@autoform/react";
   import { ZodProvider } from "@autoform/zod";
   import { z } from "zod";

   const schema = z.object({
     name: z.string().min(1, "Name is required"),
     email: z.string().email(),
     age: z.number().min(18),
   });

   <AutoForm schema={schema} onSubmit={handleSubmit} provider={ZodProvider} />;

   // ✅ GOOD - React Hook Form for complex forms with custom components
   import { useForm } from "react-hook-form";
   import { zodResolver } from "@hookform/resolvers/zod";
   import { z } from "zod";

   const schema = z.object({
     name: z.string().min(1),
     // ... complex validation
   });

   const { register, handleSubmit } = useForm({
     resolver: zodResolver(schema),
   });

   // ✅ GOOD - Zod for validation
   import { z } from "zod";

   // ✅ GOOD - protovalidate-es for protobuf-based validation
   import { validate } from "protovalidate-es";

   // ❌ BAD - Yup validation (legacy)
   import * as yup from "yup";

   // ❌ BAD - Manually managed form state with Chakra
   ```

### State Management

**Philosophy: Local First, Global When Needed**

This codebase is migrating from MobX to modern React patterns. Prefer local state for component-specific data, use Zustand only for truly global or persisted state.

**When to Use Local State (`useState`):**

- Component-specific UI state (dropdowns, modals, form inputs)
- Temporary data that doesn't need to persist
- State that only 1-2 components need (use prop drilling or composition)

**When to Use Zustand:**

- Cross-component state that doesn't belong in URL or server
- User preferences and settings (theme, sidebar state)
- Multi-step wizard/form data that persists across navigation
- State that needs to survive component unmounts
- UI state that needs sessionStorage persistence

**❌ Never Use MobX for New Code:**

- Legacy stores in `src/state/` use MobX decorators (`@observable`, `@action`)
- Do not expand or create new MobX stores
- Gradually migrate to Zustand or local state when refactoring

**Basic Zustand Store:**

```typescript
import { create } from "zustand";

type UserPreferences = {
  theme: "light" | "dark";
  sidebarCollapsed: boolean;
  setTheme: (theme: "light" | "dark") => void;
  toggleSidebar: () => void;
};

export const usePreferencesStore = create<UserPreferences>((set) => ({
  theme: "light",
  sidebarCollapsed: false,
  setTheme: (theme) => set({ theme }),
  toggleSidebar: () =>
    set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
}));

// Usage in components - use selectors to optimize rerenders
const theme = usePreferencesStore((state) => state.theme);
const setTheme = usePreferencesStore((state) => state.setTheme);
```

**Persisted Store (SessionStorage):**

```typescript
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { createPersistedZustandSessionStorage } from "utils/store";

type WizardState = {
  step: number;
  formData: Record<string, unknown>;
  setStep: (step: number) => void;
  updateFormData: (data: Record<string, unknown>) => void;
  reset: () => void;
};

export const useWizardStore = create<WizardState>()(
  persist(
    (set) => ({
      step: 1,
      formData: {},
      setStep: (step) => set({ step }),
      updateFormData: (formData) => set({ formData }),
      reset: () => set({ step: 1, formData: {} }),
    }),
    {
      name: "wizard-state",
      storage:
        createPersistedZustandSessionStorage<
          Pick<WizardState, "step" | "formData">
        >(),
    }
  )
);
```

**Testing Zustand Stores:**

```typescript
import { vi } from "vitest";

// Enable automatic store reset between tests
vi.mock("zustand");

describe("Component using Zustand", () => {
  beforeEach(() => {
    sessionStorage.clear(); // Clear persisted state
  });

  it("should update store state", () => {
    const { result } = renderHook(() => useWizardStore());

    act(() => {
      result.current.setStep(2);
    });

    expect(result.current.step).toBe(2);
  });
});
```

**Best Practices:**

```typescript
// ✅ GOOD - Use selectors to prevent unnecessary rerenders
const theme = usePreferencesStore((state) => state.theme);

// ❌ BAD - Subscribing to entire store (rerenders on any state change)
const store = usePreferencesStore();

// ✅ GOOD - Always include reset functions for testability
const useStore = create<State>((set) => ({
  data: null,
  setData: (data) => set({ data }),
  reset: () => set({ data: null }),
}));

// ✅ GOOD - Separate state types from action types for clarity
type StoreState = {
  count: number;
};

type StoreActions = {
  increment: () => void;
  reset: () => void;
};

const useCountStore = create<StoreState & StoreActions>((set) => ({
  count: 0,
  increment: () => set((state) => ({ count: state.count + 1 })),
  reset: () => set({ count: 0 }),
}));
```

### API Communication

**gRPC-Web via Connect Protocol:**

The frontend communicates with the backend using Connect protocol (`@connectrpc/connect-web`).

1. **Use React Query hooks** from `/src/react-query/`:

   ```tsx
   import { useQuery } from "@tanstack/react-query";
   import { queryClient } from "queryClient";
   ```

2. **Protobuf schemas** in `/src/protogen/` are auto-generated:

   - Never manually edit these files
   - Regenerate with `task proto:generate` from repository root

3. **Transport configuration** in `App.tsx`:
   - Base URL configured for embedded vs standalone mode
   - Bearer token and license interceptors

### Routing

- **React Router v6** configured in `src/components/routes.tsx`
- Route definitions use `PageDefinition<TRouteParams>` interface
- Pages are in `src/components/pages/`

### Build System

**Rsbuild (Rspack) configured in `rsbuild.config.ts`:**

- Module Federation for microfrontend architecture
- Monaco Editor for YAML/JSON editing
- Node polyfills for browser compatibility
- SASS and SVGR support
- Environment variables with `REACT_APP_` prefix

### TypeScript Configuration

- `baseUrl: "src"` - Allows absolute imports from `src/` directory
- Strict mode enabled
- Decorators: `experimentalDecorators: true` (legacy, don't use in new code)

### Styling Approach & Component Composition Philosophy

**🎯 CRITICAL PRINCIPLE: Separate Business Logic from Styling**

**Where Styling Should Live:**

1. **Redpanda UI Registry Components** (`src/components/redpanda-ui/`)

   - All reusable UI components with their styling encapsulated
   - Built on shadcn + Tailwind CSS v4
   - Examples: Button, Dialog, Card, Table, Input, etc.

2. **Layout Components** (`src/components/layout/`)

   - Page structure, spacing, and grid systems
   - Container wrappers and section layouts

3. **Business Logic Components** (Minimal styling)
   - Focus on data fetching, state management, and business rules
   - Use composition of UI registry components
   - Minimal to no className usage

**Best Practices:**

```tsx
// ✅ EXCELLENT - Clean separation
// Business logic component uses pre-styled components
export const MCPServerPage = () => {
  const { data, isLoading } = useMCPServers();

  return (
    <PageLayout>
      <PageHeader title="MCP Servers" actions={<CreateServerButton />} />
      <ServerList servers={data} loading={isLoading} />
    </PageLayout>
  );
};

// ❌ BAD - Mixing concerns
export const MCPServerPage = () => {
  const { data, isLoading } = useMCPServers();

  return (
    <div className="flex flex-col w-full min-h-screen p-8 bg-gray-50">
      <div className="flex items-center justify-between mb-6 pb-4 border-b">
        <h1 className="text-2xl font-semibold">MCP Servers</h1>
        <button className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600">
          Create
        </button>
      </div>
      {/* ... lots more inline styling ... */}
    </div>
  );
};
```

**When You Need New Styling:**

1. **Check if component exists** in `src/components/redpanda-ui/components/`
2. **If not, create it there** with styling encapsulated
3. **Then use it** in your business logic component

**For New Components:**

1. Use pre-built Redpanda UI registry components
2. Create new registry components when needed (not inline styles)
3. Use `cn` utility from `components/redpanda-ui/lib/utils` for conditional classes
4. Minimal Tailwind usage in page/feature components

**Legacy Styling** (do not expand):

- `@redpanda-data/ui` - Legacy Chakra UI-based package (migrating away from)
- `index.scss` - Global SCSS (legacy)
- Chakra UI theme and components

## Development Workflow

### Adding a New Feature Page

1. Create page component in `src/components/pages/your-feature/`
2. Use functional components with hooks
3. **Compose with Redpanda UI components** from `src/components/redpanda-ui/`
   - If a component doesn't exist, create it in the registry first
   - Keep business logic components free of styling details
4. **Minimize className usage** - delegate styling to UI components and layouts
5. Add route definition in `src/components/routes.tsx`
6. For state: use local state or Zustand (not MobX)
7. Write integration tests with Vitest (focus on CRUD and API calls, not component rendering)
8. Write E2E tests with Playwright for complex user journeys

**Example Structure:**

```tsx
// src/components/pages/my-feature/my-feature-page.tsx
// ✅ GOOD - Clean business logic, composed from UI components
export const MyFeaturePage = () => {
  const { data } = useMyFeatureData();

  return (
    <PageLayout>
      <PageHeader title="My Feature" />
      <MyFeatureList items={data} />
    </PageLayout>
  );
};

// If you need a custom styled component, create it in the registry:
// src/components/redpanda-ui/components/my-feature-card.tsx
export const MyFeatureCard = ({ title, description }: Props) => {
  return (
    <Card className="p-4 hover:shadow-lg transition-shadow">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>{description}</CardContent>
    </Card>
  );
};
```

### Working with Existing Code

**When modifying legacy code:**

- If it's a small change, maintain existing patterns
- If it's a major refactor, consider migrating to modern patterns
- Never expand usage of MobX, Chakra UI, or class components

**When reading legacy code:**

- MobX stores in `/src/state/` use `@observable`, `@computed`, `@action` decorators
- Components wrapped with `observer()` are reactive to MobX stores
- Chakra UI components are being phased out

### Common Patterns

**Data Fetching:**

```tsx
// ✅ Modern - React Query
const { data, isLoading, error } = useQuery({
  queryKey: ["resource", id],
  queryFn: () => fetchResource(id),
});
```

**Testing:**

```tsx
// ✅ GOOD - Integration test for API calls and business logic (Vitest)
import { describe, test, expect, vi } from "vitest";

describe("MCP Server CRUD", () => {
  test("should create MCP server with correct transport call", async () => {
    const mockTransport = vi.fn(() =>
      Promise.resolve({ id: "123", name: "test" })
    );

    const result = await createMCPServer({
      name: "test",
      url: "http://example.com",
    });

    // Verify gRPC Connect endpoint was called with correct data
    expect(mockTransport).toHaveBeenCalledWith({
      name: "test",
      url: "http://example.com",
    });
    expect(result.id).toBe("123");
  });

  test("should handle server creation errors", async () => {
    const mockTransport = vi.fn(() =>
      Promise.reject(new Error("Network error"))
    );

    await expect(createMCPServer({ name: "test" })).rejects.toThrow(
      "Network error"
    );
  });
});

// ✅ GOOD - E2E test for complex user journeys (Playwright)
// File: tests/console/remote-mcp.spec.ts
import { test, expect } from "@playwright/test";

test("user can create and configure MCP server", async ({ page }) => {
  await page.goto("/remote-mcp");
  await page.click("text=Create Server");
  await page.fill('[name="name"]', "My Server");
  await page.fill('[name="url"]', "http://example.com");
  await page.click("text=Submit");
  await expect(page.locator("text=My Server")).toBeVisible();
  // Test multi-step workflow across pages
  await page.click("text=My Server");
  await page.click("text=Configure");
  // ... more complex interactions
});

// For enterprise features:
// File: tests/console-enterprise/sso.spec.ts
test("enterprise user can configure SSO", async ({ page }) => {
  // ... enterprise-specific test
});

// ❌ BAD - Testing component rendering (components tested in UI registry)
test("button renders with correct text", () => {
  render(<Button>Click me</Button>);
  expect(screen.getByText("Click me")).toBeInTheDocument();
});

// ❌ BAD - Testing UI component behavior (tested in UI registry)
test("dialog opens when button is clicked", () => {
  render(<DialogComponent />);
  fireEvent.click(screen.getByRole("button"));
  expect(screen.getByRole("dialog")).toBeVisible();
});
```

**Modal/Dialog:**

```tsx
// ✅ Modern - Redpanda UI Dialog
import {
  Dialog,
  DialogContent,
  DialogHeader,
} from "components/redpanda-ui/components/dialog";

<Dialog open={isOpen} onOpenChange={setIsOpen}>
  <DialogContent>
    <DialogHeader>Title</DialogHeader>
    ...
  </DialogContent>
</Dialog>;
```

**Forms:**

```tsx
// ✅ EXCELLENT - AutoForm for simple forms (automatically generates UI)
import { AutoForm } from '@autoform/react';
import { ZodProvider } from '@autoform/zod';
import { z } from 'zod';

const createServerSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  url: z.string().url('Must be a valid URL'),
  apiKey: z.string().optional(),
});

export const CreateServerForm = ({ onSubmit }: Props) => {
  return (
    <AutoForm
      schema={createServerSchema}
      onSubmit={onSubmit}
      provider={ZodProvider}
    />
  );
};

// ✅ GOOD - React Hook Form for complex forms with custom components
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Button } from 'components/redpanda-ui/components/button';
import { Input } from 'components/redpanda-ui/components/input';

const schema = z.object({
  name: z.string().min(1),
  // ... complex validation
});

const { register, handleSubmit, formState: { errors } } = useForm({
  resolver: zodResolver(schema),
});

// ❌ BAD - Yup validation (legacy)
import * as yup from 'yup';
const schema = yup.object().shape({ ... });
```

**Styling - Component Composition:**

```tsx
// ✅ EXCELLENT - Create a UI component in the registry
// src/components/redpanda-ui/components/status-badge.tsx
import { cn } from 'components/redpanda-ui/lib/utils';

export const StatusBadge = ({ status, children }: Props) => {
  return (
    <div className={cn(
      "inline-flex items-center gap-2 px-3 py-1 rounded-full text-sm",
      status === 'active' && "bg-green-100 text-green-800",
      status === 'inactive' && "bg-gray-100 text-gray-800"
    )}>
      {children}
    </div>
  );
};

// Then use it without any styling in business logic:
// src/components/pages/my-feature/my-feature-page.tsx
<StatusBadge status={server.status}>{server.name}</StatusBadge>

// ❌ BAD - Inline styling in business logic component
<div className={cn(
  "inline-flex items-center gap-2 px-3 py-1 rounded-full text-sm",
  isActive ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-800"
)}>
  {name}
</div>
```

## Key Files

- `src/App.tsx` - Main app component with providers
- `src/components/routes.tsx` - Route definitions
- `src/config.ts` - App configuration and feature flags
- `rsbuild.config.ts` - Build configuration
- `tsconfig.base.json` - TypeScript configuration
- `biome.json` - Linter/formatter configuration

## Environment Variables

Frontend config via `REACT_APP_` prefixed environment variables:

- `REACT_APP_ENABLED_FEATURES` - Comma-separated feature flags
- `REACT_APP_CONSOLE_GIT_SHA` - Git commit SHA
- `REACT_APP_BUSINESS` - Business features toggle
- `REACT_APP_DEV_HINT` - Development hints toggle

## Migration Strategy Summary

**DO:**

- ✅ Minimize CSS/className usage in business logic components
- ✅ Create reusable UI components in Redpanda UI registry (`src/components/redpanda-ui/`)
- ✅ Use component composition to separate styling from business logic
- ✅ Use Redpanda UI registry components (Tailwind-based, NOT `@redpanda-data/ui`)
- ✅ Use functional components with React hooks
- ✅ Use local state or Zustand for state management
- ✅ Use Vitest for unit and integration tests (CRUD, API calls, business logic)
- ✅ Focus integration tests on gRPC Connect transport calls, not component rendering
- ✅ Use Playwright for E2E tests (complex browser scenarios and user journeys)
- ✅ Use AutoForm for simple forms (no custom components)
- ✅ Use React Hook Form for complex forms with custom components
- ✅ Use Zod or protovalidate-es for validation schemas
- ✅ Run `bun i --yarn` after installing packages

**DON'T:**

- ❌ Add heavy styling/classNames to business logic components
- ❌ Use `@redpanda-data/ui` package (legacy Chakra-based)
- ❌ Use Chakra UI directly
- ❌ Use MobX for new state management
- ❌ Create new class components
- ❌ Use decorator pattern (`@observable`, `@action`, etc.)
- ❌ Use Yup for validation
- ❌ Use Jest for tests
- ❌ Write tests that extensively test component rendering (tested in UI registry)
- ❌ Test UI component behavior in integration tests (use Playwright for UI flows)
- ❌ Expand legacy patterns in new code
