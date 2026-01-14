# Route Templates

Complete templates for all common route file scenarios.

## Root Layout (`__root.tsx`)

```typescript
// src/routes/__root.tsx
import { createRootRouteWithContext, Outlet } from '@tanstack/react-router';
import { TanStackRouterDevtools } from '@tanstack/react-router-devtools';
import type { QueryClient } from '@tanstack/react-query';
import { NuqsAdapter } from 'nuqs/adapters/tanstack-router';
import { ErrorBoundary } from '../components/error-boundary';
import { AppLayout } from '../components/layout/app-layout';

export type RouterContext = {
  basePath: string;
  queryClient: QueryClient;
};

export const Route = createRootRouteWithContext<RouterContext>()({
  component: RootLayout,
});

function RootLayout() {
  return (
    <>
      <NuqsAdapter>
        <ErrorBoundary>
          <AppLayout>
            <Outlet />
          </AppLayout>
        </ErrorBoundary>
      </NuqsAdapter>
      {process.env.NODE_ENV === 'development' && (
        <TanStackRouterDevtools position="bottom-right" />
      )}
    </>
  );
}
```

## Root Redirect (`index.tsx`)

```typescript
// src/routes/index.tsx
import { createFileRoute, Navigate } from '@tanstack/react-router';

export const Route = createFileRoute('/')({
  component: () => <Navigate replace to="/overview" />,
});
```

## Basic Page Route

```typescript
// src/routes/overview/index.tsx
import { createFileRoute } from '@tanstack/react-router';
import { HomeIcon } from '../../components/icons';
import { OverviewPage } from '../../components/pages/overview';

export const Route = createFileRoute('/overview/')({
  staticData: {
    title: 'Overview',
    icon: HomeIcon,
  },
  component: OverviewPage,
});
```

## Dynamic Parameter Route

```typescript
// src/routes/topics/$topicName/index.tsx
import { createFileRoute, useParams } from '@tanstack/react-router';
import { TopicDetails } from '../../../components/pages/topics/topic-details';

export const Route = createFileRoute('/topics/$topicName/')({
  staticData: {
    title: 'Topic Details',
  },
  component: TopicDetailsWrapper,
});

function TopicDetailsWrapper() {
  const { topicName } = useParams({ from: '/topics/$topicName/' });
  return <TopicDetails topicName={topicName} />;
}
```

## Multiple Dynamic Parameters

```typescript
// src/routes/knowledgebases/$knowledgebaseId/documents/$documentId.tsx
import { createFileRoute, useParams } from '@tanstack/react-router';
import { DocumentDetails } from '../../../../components/pages/documents/document-details';

export const Route = createFileRoute('/knowledgebases/$knowledgebaseId/documents/$documentId')({
  staticData: {
    title: 'Document Details',
  },
  component: DocumentDetailsWrapper,
});

function DocumentDetailsWrapper() {
  const { knowledgebaseId, documentId } = useParams({
    from: '/knowledgebases/$knowledgebaseId/documents/$documentId',
  });
  return <DocumentDetails knowledgebaseId={knowledgebaseId} documentId={documentId} />;
}
```

## Route with Search Params (Zod Validation)

```typescript
// src/routes/mcp-servers/$id.tsx
import { createFileRoute, useParams } from '@tanstack/react-router';
import { fallback, zodValidator } from '@tanstack/zod-adapter';
import { z } from 'zod';
import { MCPServerDetails } from '../../components/pages/mcp-servers/mcp-server-details';

const searchSchema = z.object({
  tab: fallback(z.string().optional(), undefined),
  q: fallback(z.string().optional(), undefined),
  expanded: fallback(z.boolean().optional(), false),
});

export const Route = createFileRoute('/mcp-servers/$id')({
  staticData: {
    title: 'MCP Server Details',
  },
  validateSearch: zodValidator(searchSchema),
  component: MCPServerDetailsWrapper,
});

function MCPServerDetailsWrapper() {
  const { id } = useParams({ from: '/mcp-servers/$id' });
  return <MCPServerDetails id={id} />;
}
```

## List Page with Pagination/Filtering

```typescript
// src/routes/topics/index.tsx
import { createFileRoute } from '@tanstack/react-router';
import { fallback, zodValidator } from '@tanstack/zod-adapter';
import { z } from 'zod';
import { CollectionIcon } from '../../components/icons';
import { TopicList } from '../../components/pages/topics/topic-list';

const searchSchema = z.object({
  q: fallback(z.string().optional(), undefined),
  page: fallback(z.number().optional(), 1),
  pageSize: fallback(z.number().optional(), 25),
  sort: fallback(z.enum(['name', 'partitions', 'replication']).optional(), 'name'),
  sortDir: fallback(z.enum(['asc', 'desc']).optional(), 'asc'),
});

export const Route = createFileRoute('/topics/')({
  staticData: {
    title: 'Topics',
    icon: CollectionIcon,
  },
  validateSearch: zodValidator(searchSchema),
  component: TopicList,
});
```

## Section Redirect Route

```typescript
// src/routes/security/index.tsx
import { createFileRoute, Navigate } from '@tanstack/react-router';

export const Route = createFileRoute('/security/')({
  component: () => <Navigate replace to="/security/users" />,
});
```

## Tabbed Page Route

```typescript
// src/routes/security/$tab.tsx
import { createFileRoute, useParams } from '@tanstack/react-router';
import { fallback, zodValidator } from '@tanstack/zod-adapter';
import { z } from 'zod';
import { SecurityPage } from '../../components/pages/security';

const searchSchema = z.object({
  q: fallback(z.string().optional(), undefined),
});

export const Route = createFileRoute('/security/$tab')({
  staticData: {
    title: 'Security',
  },
  validateSearch: zodValidator(searchSchema),
  component: SecurityWrapper,
});

function SecurityWrapper() {
  const { tab } = useParams({ from: '/security/$tab' });
  return <SecurityPage activeTab={tab} />;
}
```

## Create/Edit Form Route

```typescript
// src/routes/agents/create.tsx
import { createFileRoute } from '@tanstack/react-router';
import { fallback, zodValidator } from '@tanstack/zod-adapter';
import { z } from 'zod';
import { AgentCreatePage } from '../../components/pages/agents/agent-create';

const searchSchema = z.object({
  template: fallback(z.string().optional(), undefined),
  knowledgebaseId: fallback(z.string().optional(), undefined),
});

export const Route = createFileRoute('/agents/create')({
  staticData: {
    title: 'Create Agent',
  },
  validateSearch: zodValidator(searchSchema),
  component: AgentCreatePage,
});
```

## Wrapper Pattern for Legacy Components

Use this pattern when wrapping existing page components that expect specific props:

```typescript
// src/routes/topics/$topicName/index.tsx
import { createFileRoute, useParams } from '@tanstack/react-router';
import TopicDetails from '../../../components/pages/topics/topic-details';

export const Route = createFileRoute('/topics/$topicName/')({
  staticData: {
    title: 'Topic Details',
  },
  component: TopicDetailsWrapper,
});

function TopicDetailsWrapper() {
  const { topicName } = useParams({ from: '/topics/$topicName/' });

  // Pass both topicName and matchedPath for legacy components
  // that need the full matched path for breadcrumbs or navigation
  return (
    <TopicDetails
      topicName={topicName}
      matchedPath={`/topics/${topicName}`}
    />
  );
}
```

## Route with Icon and Metadata

```typescript
// src/routes/schemas/index.tsx
import { createFileRoute } from '@tanstack/react-router';
import { fallback, zodValidator } from '@tanstack/zod-adapter';
import { z } from 'zod';
import { SchemaRegistryIcon } from '../../components/icons';
import { SchemaList } from '../../components/pages/schemas/schema-list';

const searchSchema = z.object({
  q: fallback(z.string().optional(), undefined),
});

export const Route = createFileRoute('/schemas/')({
  staticData: {
    title: 'Schema Registry',
    icon: SchemaRegistryIcon,
    description: 'Manage Avro, Protobuf, and JSON schemas',
  },
  validateSearch: zodValidator(searchSchema),
  component: SchemaList,
});
```

## File Naming Reference

| URL Pattern | File Path |
|-------------|-----------|
| `/` | `src/routes/index.tsx` |
| `/topics` | `src/routes/topics/index.tsx` |
| `/topics/:topicName` | `src/routes/topics/$topicName/index.tsx` or `src/routes/topics/$topicName.tsx` |
| `/topics/:topicName/edit` | `src/routes/topics/$topicName/edit.tsx` |
| `/security/users/create` | `src/routes/security/users/create.tsx` |
| `/security/users/:userName/details` | `src/routes/security/users/$userName/details.tsx` |

## Directory vs Flat Structure

**Directory structure** (recommended for nested routes):

```
src/routes/
├── topics/
│   ├── index.tsx           # /topics
│   └── $topicName/
│       ├── index.tsx       # /topics/:topicName
│       └── edit.tsx        # /topics/:topicName/edit
```

**Flat structure** (for simple, shallow routes):

```
src/routes/
├── topics.index.tsx        # /topics
├── topics.$topicName.tsx   # /topics/:topicName
├── topics.$topicName.edit.tsx  # /topics/:topicName/edit
```

Both structures generate the same routes. Use directory structure for better organization in larger applications.
