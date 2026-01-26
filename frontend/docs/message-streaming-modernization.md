# Message Streaming Modernization Plan

## Overview

Migrate from legacy MobX-based `createMessageSearch` to modern React hooks (`useListMessagesStream`).

## Feature Comparison

| Feature | Modern | Legacy | Priority |
|---------|:------:|:------:|:--------:|
| **Core** |
| Connect RPC streaming | ✓ | ✓ | - |
| AbortController | ✓ | ✓ | - |
| Progress tracking | ✓ | ✓ | - |
| Auto-restart on options change | ✓ | ✗ | - |
| Retry on error | ✓ | ✗ | - |
| **Filtering** |
| Server-side filter code | ✓ | ✓ | - |
| Client-side search | ✓ | ✓ | - |
| Partition selection | ✗ | ✓ | P1 |
| Custom offset | ✗ | ✓ | P1 |
| Timestamp offset | ✓ | ✓ | - |
| JS filter editor | ✗ | ✓ | P2 |
| **Deserialization** |
| Key deserializer | ✗ | ✓ | P1 |
| Value deserializer | ✗ | ✓ | P1 |
| **Data Export** |
| Save messages to file | ✗ | ✓ | P2 |
| Copy message/key/value | ✗ | ✓ | P2 |
| Load large message (bypass size limit) | ✗ | ✓ | P3 |
| **State Persistence** |
| URL state (nuqs) | ✗ | ✓ | P2 |
| Session storage filters | ✗ | ✓ | P3 |

## Missing Functionality (by priority)

### P1 - Core Query Options

1. **Partition selection** - `partitionId` option exists but no UI hook
2. **Custom offset modes** - Need `StartOffset.CUSTOM` handling
3. **Deserializer selection** - `keyDeserializer`/`valueDeserializer` exist but no UI hook

### P2 - Enhanced Features

4. **JS filter editor** - Server-side `filterInterpreterCode` works, need editor UI
5. **Save messages** - Export to JSON/CSV
6. **Copy actions** - Copy message, key, value, timestamp
7. **URL state** - Persist query params via nuqs

### P3 - Advanced

8. **Load large message** - `ignoreMaxSizeLimit` option exists, need trigger mechanism
9. **Session filter storage** - Persist JS filters across sessions

## Implementation Plan

### Phase 1: Hook Extensions

Create `useTopicMessages` wrapper (similar to `usePipelineLogs`):

```typescript
// src/react-query/api/topic-messages.ts
type UseTopicMessagesOptions = {
  topic: string;
  partitionId?: number;        // -1 = all
  startOffset: StartOffsetType; // RECENT | OLDEST | NEWEST | TIMESTAMP | number
  startTimestamp?: bigint;
  maxResults?: number;
  filterCode?: string;
  keyDeserializer?: PayloadEncoding;
  valueDeserializer?: PayloadEncoding;
  enabled?: boolean;
};
```

### Phase 2: Action Utilities

```typescript
// src/utils/message-actions.ts
export const copyMessage = (msg: TopicMessage) => { ... }
export const copyKey = (msg: TopicMessage) => { ... }
export const copyValue = (msg: TopicMessage) => { ... }
export const downloadMessages = (msgs: TopicMessage[], format: 'json' | 'csv') => { ... }
```

### Phase 3: Filter Persistence

```typescript
// src/hooks/use-topic-filters.ts
export const useTopicFilters = (topicName: string) => {
  // nuqs for URL state
  // sessionStorage for JS filters
};
```

## Files to Create

1. `src/react-query/api/topic-messages.ts` - Topic-specific hook
2. `src/utils/message-actions.ts` - Copy/download utilities
3. `src/hooks/use-topic-filters.ts` - Filter state management

## Files to Modify

1. `src/react-query/api/messages.tsx` - Already updated with retry + auto-restart
2. `src/components/ui/pipeline/use-pipeline-logs.ts` - Already updated with stable levels

## Deprecation Path

1. Mark `createMessageSearch` as `@deprecated` (done)
2. Migrate consumers incrementally
3. Remove after all consumers migrated
