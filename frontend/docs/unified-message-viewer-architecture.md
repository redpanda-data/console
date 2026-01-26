# Unified Message Viewer Architecture

Scalable architecture for a DataTable-based message viewer with virtualization, streaming, and full feature parity.

## Problem Statement

Current state:
- **Legacy**: `Tab.Messages/` uses MobX + `@redpanda-data/ui` DataTable (no virtualization, pagination-based)
- **Modern**: `LogExplorer` uses custom CSS Grid + `@tanstack/react-virtual` (virtualized, but not DataTable)

Goal: Unified `MessageViewer` component using:
- TanStack Table for data management, filtering, sorting, column visibility
- TanStack Virtual for virtualization
- Modern redpanda-ui Table primitives
- Support for streaming (tail mode), infinite scroll, and all legacy features

## Scroll Position Management Research

### Existing Solution: ai-elements + use-stick-to-bottom

The `ai-elements` library (in this codebase) uses [`use-stick-to-bottom`](https://github.com/stackblitz-labs/use-stick-to-bottom) for chat scroll handling:

```tsx
// src/components/ai-elements/conversation.tsx
import { StickToBottom, useStickToBottomContext } from "use-stick-to-bottom";

export const Conversation = ({ className, ...props }: ConversationProps) => (
  <StickToBottom
    className={cn("relative flex-1 overflow-y-auto", className)}
    initial="smooth"
    resize="smooth"
    role="log"
    {...props}
  />
);
```

**Key features of use-stick-to-bottom:**
- Zero-dependency, powers [bolt.new](https://bolt.new) by StackBlitz
- **Scroll Anchoring**: "When content above the viewport resizes, it doesn't cause content currently displayed in viewport to jump up or down"
- Works without `overflow-anchor` CSS (Safari doesn't support it)
- Uses `ResizeObserver` API for content resize detection
- Physics-based spring animation for natural-feeling transitions
- `isAtBottom` boolean + `scrollToBottom()` returning `Promise<boolean>`

**Limitation**: Only handles append-to-bottom scenarios, not bidirectional.

### Bidirectional Scroll Solutions

#### Option 1: react-virtuoso (Recommended for bidirectional)

Per [react-virtuoso bidirectional discussion](https://github.com/petyosi/react-virtuoso/discussions/634):

```typescript
// The firstItemIndex technique
const [firstItemIndex, setFirstItemIndex] = useState(10000); // Start high
const [data, setData] = useState<Message[]>([]);

// Prepending (scrolling up to load older)
const prependItems = useCallback(async () => {
  const newData = await fetchOlderMessages();
  const nextFirstItemIndex = firstItemIndex - newData.length;
  setFirstItemIndex(nextFirstItemIndex);
  setData((prev) => [...newData, ...prev]);
}, [firstItemIndex]);

// Appending (scrolling down or new messages)
const appendItems = useCallback(async () => {
  const newData = await fetchNewerMessages();
  setData((prev) => [...prev, ...newData]);
  // Don't update firstItemIndex for append!
}, []);
```

**Key insight**: `firstItemIndex` is only modified during prepend operations. The large initial value (10000) provides "room" for prepending without going negative.

**Note**: `VirtuosoMessageList` is a commercial component ($168/seat) specifically for chat, but the base `react-virtuoso` with `firstItemIndex` is open source.

#### Option 2: Manual scroll offset calculation (react-window/TanStack Virtual)

Per [StackBlitz bidirectional example](https://stackblitz.com/edit/virtualized-bidirectional-infinite-scroll):

```typescript
// After prepending items, adjust scroll position
const scrollOffset = listRef.current.state.scrollOffset;
const prependedHeight = newItems.length * ITEM_HEIGHT;
listRef.current.scrollTo(scrollOffset + prependedHeight);
```

#### Option 3: Native scroll anchoring (limited browser support)

CSS `overflow-anchor: auto` provides native scroll anchoring, but Safari doesn't support it. The `use-stick-to-bottom` library exists specifically because of this limitation.

#### Option 4: maintainVisibleContentPosition (React Native only)

Stream's [react-native-bidirectional-infinite-scroll](https://getstream.github.io/react-native-bidirectional-infinite-scroll/how-it-works/) uses `maintainVisibleContentPosition` prop, but this is React Native only.

### Similar UIs with This Pattern

| UI Type | Pattern | Solution Used |
|---------|---------|---------------|
| Chat apps (Slack, Discord) | Bidirectional + tail | Custom scroll anchoring |
| Terminal emulators (xterm.js) | Append-only + scroll lock | [Configurable auto-scroll](https://github.com/xtermjs/xterm.js/issues/1824) |
| Log viewers (Kubetail) | Tail streaming | Auto-scroll with pause on user scroll |
| IDE consoles | Append-only | Scroll lock toggle button |
| Kafka message viewers | Historical + tail | Pagination (current legacy) |

### xterm.js Scroll Behavior

Per [xterm.js issues](https://github.com/xtermjs/xterm.js/issues/216):
- **Problem**: When user scrolls up to view history, new output shouldn't interrupt
- **Solution**: Track user scroll state, only auto-scroll when user is "at bottom"
- This is exactly what `use-stick-to-bottom` provides via `isAtBottom`

### TanStack Virtual Limitations

Per [TanStack Virtual Discussion #195](https://github.com/TanStack/virtual/discussions/195):
> TanStack Virtual can handle this, but the recipe isn't very obvious right now. A bidirectional infinite list + restoring an initial offset is doable today, but it definitely deserves its own example in the docs.

**Key challenges:**
1. Prepending items shifts scroll position (viewport jumps)
2. `scaleY(-1)` CSS hack has accessibility issues (screen readers, text selection)
3. Must manually update scroll offset when prepending

### Recommendation: Hybrid Approach

| Mode | Library | Strategy |
|------|---------|----------|
| **Tail/Live** | `use-stick-to-bottom` | Append-only, auto-scroll to bottom, pause when user scrolls up |
| **Historical + Load Older** | TanStack Virtual + manual offset | `firstItemIndex` pattern, adjust scroll on prepend |
| **Combined (bidirectional)** | Consider `react-virtuoso` | Built-in `startReached`/`endReached` + `firstItemIndex` |

### Deduplication Strategy

**Decision**: Clear and refetch on restart.

When user restarts the stream:
1. Abort current stream
2. Clear message array
3. Start fresh stream
4. No deduplication logic needed

This avoids complexity of tracking seen offsets across restarts.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           MessageViewer                                  │
├─────────────────────────────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                    MessageViewerToolbar                          │   │
│  │  ┌──────────┐ ┌────────────┐ ┌────────────┐ ┌─────────────────┐ │   │
│  │  │StartOffset│ │ MaxResults │ │ Partitions │ │ Add Filter Menu │ │   │
│  │  └──────────┘ └────────────┘ └────────────┘ └─────────────────┘ │   │
│  │  ┌────────────────┐ ┌────────────────┐ ┌──────────────────────┐ │   │
│  │  │ JS Filter Tags │ │ Search Input   │ │ Settings Menu        │ │   │
│  │  └────────────────┘ └────────────────┘ └──────────────────────┘ │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                    VirtualizedMessageTable                       │   │
│  │  ┌─────────────────────────────────────────────────────────────┐│   │
│  │  │ Fixed Header Table (TableHeader)                            ││   │
│  │  │ colgroup for column alignment                               ││   │
│  │  └─────────────────────────────────────────────────────────────┘│   │
│  │  ┌─────────────────────────────────────────────────────────────┐│   │
│  │  │ Scrollable Body (ref={scrollContainerRef})                  ││   │
│  │  │  ┌───────────────────────────────────────────────────────┐ ││   │
│  │  │  │ TableBody with padding rows + virtual rows            │ ││   │
│  │  │  │ useVirtualizer for row virtualization                 │ ││   │
│  │  │  └───────────────────────────────────────────────────────┘ ││   │
│  │  └─────────────────────────────────────────────────────────────┘│   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                    MessageDetailSheet                            │   │
│  │  Expanded view, copy actions, load large message, headers, etc. │   │
│  └─────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────┘
```

## Data Layer

### Core Streaming Hook

```typescript
// src/react-query/api/use-message-stream.ts

type MessageStreamMode = 'historical' | 'tail' | 'timestamp';

type UseMessageStreamOptions = {
  topic: string;
  mode: MessageStreamMode;

  // Filtering
  partitionId?: number;           // -1 = all partitions
  startOffset?: bigint;           // for mode='historical' with custom offset
  startTimestamp?: bigint;        // for mode='timestamp'
  maxResults?: number;
  filterCode?: string;            // Base64 encoded JS filter

  // Deserialization
  keyDeserializer?: PayloadEncoding;
  valueDeserializer?: PayloadEncoding;

  // Streaming control
  enabled?: boolean;
  retryCount?: number;
  retryDelay?: number;

  // Callbacks
  onMessage?: (message: TopicMessage) => void;
  onProgress?: (progress: StreamProgress) => void;
  onError?: (error: Error) => void;
};

type UseMessageStreamReturn = {
  messages: TopicMessage[];
  isStreaming: boolean;
  isLoading: boolean;
  error: Error | null;
  progress: StreamProgress;

  // Controls
  start: () => void;
  stop: () => void;
  restart: () => void;
  clear: () => void;
};
```

### TanStack Table Integration

```typescript
// src/components/ui/message-viewer/use-message-table.ts

type UseMessageTableOptions = {
  messages: TopicMessage[];
  columns: MessageColumnConfig[];

  // Features
  enableSorting?: boolean;
  enableFiltering?: boolean;
  enableColumnVisibility?: boolean;

  // Callbacks
  onRowClick?: (message: TopicMessage) => void;
};

// Returns TanStack Table instance configured for messages
const table = useReactTable<TopicMessage>({
  data: messages,
  columns,
  getCoreRowModel: getCoreRowModel(),
  getSortedRowModel: getSortedRowModel(),
  getFilteredRowModel: getFilteredRowModel(),
  // Column visibility, sorting state, etc.
});
```

### Virtualization Layer

```typescript
// src/components/ui/message-viewer/use-virtualized-rows.ts

type UseVirtualizedRowsOptions = {
  table: Table<TopicMessage>;
  scrollContainerRef: RefObject<HTMLDivElement>;
  rowHeight?: number;           // Fixed height for performance
  overscan?: number;            // Rows to render outside viewport

  // Infinite scroll
  hasNextPage?: boolean;
  fetchNextPage?: () => void;
  isFetchingNextPage?: boolean;

  // Tail mode
  autoScrollToBottom?: boolean;
};

// Returns virtualizer + helpers
const {
  virtualizer,
  virtualRows,
  paddingTop,
  paddingBottom,
  scrollToBottom,
} = useVirtualizedRows(options);
```

## Component Structure

### File Organization

```
src/components/ui/message-viewer/
├── index.ts                          # Barrel exports
├── message-viewer.tsx                # Main orchestrator
├── message-viewer-toolbar.tsx        # Toolbar with filters
├── virtualized-message-table.tsx     # Table with virtualization
├── message-detail-sheet.tsx          # Side sheet for details
├── message-row.tsx                   # Single row component
├── columns/
│   ├── index.ts
│   ├── timestamp-column.tsx
│   ├── partition-column.tsx
│   ├── offset-column.tsx
│   ├── key-column.tsx
│   ├── value-column.tsx
│   └── actions-column.tsx
├── filters/
│   ├── start-offset-picker.tsx
│   ├── partition-filter.tsx
│   ├── js-filter-modal.tsx
│   └── deserializer-modal.tsx
├── hooks/
│   ├── use-message-stream.ts
│   ├── use-message-table.ts
│   ├── use-virtualized-rows.ts
│   └── use-message-url-state.ts
├── actions/
│   ├── copy-message.ts
│   ├── download-messages.ts
│   └── load-large-message.ts
├── types.ts
└── constants.ts
```

### MessageViewer Props

```typescript
type MessageViewerProps = {
  // Data source identification
  topic: string;

  // Optional: Pipeline-specific (for log viewing)
  pipelineId?: string;

  // Feature toggles
  features?: {
    filters?: boolean;            // JS filters, partition filter
    deserializers?: boolean;      // Key/value deserializer selection
    columnSettings?: boolean;     // Column visibility toggle
    previewFields?: boolean;      // Custom preview field extraction
    saveMessages?: boolean;       // Export to JSON/CSV
    copyActions?: boolean;        // Copy message/key/value/timestamp
    loadLargeMessage?: boolean;   // Bypass size limit
  };

  // Streaming modes available
  modes?: MessageStreamMode[];    // ['historical', 'tail', 'timestamp']
  defaultMode?: MessageStreamMode;

  // Display options
  maxHeight?: string;
  defaultPageSize?: number;

  // URL state management
  urlStatePrefix?: string;        // Namespace for URL params (nuqs)

  // Callbacks
  onMessageSelect?: (message: TopicMessage | null) => void;
};
```

## Feature Mapping

### From Legacy Tab.Messages

| Legacy Feature | Modern Component | Implementation |
|----------------|------------------|----------------|
| Start offset selector | `StartOffsetPicker` | Dropdown + conditional inputs |
| Max results | `MaxResultsSelect` | Select with presets |
| Partition filter | `PartitionFilter` | `FacetedFilter` from redpanda-ui |
| JS filter editor | `JSFilterModal` | Monaco editor (existing) |
| Filter tags | `FilterTagBar` | `Badge` + remove button |
| Quick search | `SearchInput` | Client-side filter on table |
| Deserializers modal | `DeserializerModal` | Key/value encoding select |
| Column settings | `ColumnSettingsModal` | Checkbox list |
| Preview fields | `PreviewFieldsModal` | JSONPath extraction config |
| Save messages | `SaveMessagesDialog` | JSON/CSV export |
| Copy message/key/value | Row actions menu | Clipboard API |
| Load large message | Row action | Re-fetch with `ignoreMaxSizeLimit` |
| Expanded row view | `MessageDetailSheet` | Side sheet with full details |
| Timestamp display | Column cell | Configurable format |
| Progress indicator | Toolbar | Streaming progress bar |

### From Modern LogExplorer

| LogExplorer Feature | MessageViewer Equivalent |
|---------------------|--------------------------|
| Level filter | N/A (log-specific) |
| Scope filter | N/A (log-specific) |
| Path display | N/A (log-specific) |
| New row highlight | `animate-message-highlight` class |
| Virtualized scroll | `VirtualizedMessageTable` |
| Detail sheet | `MessageDetailSheet` |

## Implementation Phases

### Phase 1: Core Table Infrastructure

**Goal**: DataTable + Virtualization working with static data

1. Create `VirtualizedMessageTable` using two-table pattern from `ShadowTopicsTable`
2. Define column configurations for all message fields
3. Integrate `useReactTable` + `useVirtualizer`
4. Add basic row click → detail sheet
5. Test with mock data (1000+ messages)

**Deliverables**:
- `virtualized-message-table.tsx`
- `message-row.tsx`
- `columns/*.tsx`
- `message-detail-sheet.tsx`

### Phase 2: Streaming Integration

**Goal**: Connect streaming hooks to table

1. Refactor `useListMessagesStream` → `useMessageStream` with mode support
2. Handle message accumulation (append for historical, prepend detection for tail)
3. Implement auto-scroll for tail mode
4. Add progress tracking in toolbar
5. Implement start/stop/restart controls

**Deliverables**:
- `hooks/use-message-stream.ts`
- `hooks/use-virtualized-rows.ts` with scroll management
- Streaming progress UI

### Phase 3: Filtering & Search

**Goal**: Full filtering capabilities

1. Start offset picker (Latest/Newest-N/Beginning/Offset/Timestamp)
2. Partition filter using `FacetedFilter`
3. Client-side quick search on table
4. JS filter modal integration
5. Filter tag bar with toggle/remove

**Deliverables**:
- `filters/start-offset-picker.tsx`
- `filters/partition-filter.tsx`
- `filters/js-filter-modal.tsx`
- `message-viewer-toolbar.tsx`

### Phase 4: Actions & Export

**Goal**: All message actions working

1. Copy message/key/value/timestamp actions
2. Save messages dialog (JSON/CSV)
3. Load large message action
4. Row actions dropdown menu

**Deliverables**:
- `actions/copy-message.ts`
- `actions/download-messages.ts`
- `actions/load-large-message.ts`
- Actions column with dropdown

### Phase 5: Settings & Customization

**Goal**: Full customization like legacy

1. Deserializer selection modal
2. Column visibility settings
3. Preview fields configuration
4. Timestamp format settings
5. URL state persistence (nuqs)

**Deliverables**:
- `filters/deserializer-modal.tsx`
- Column settings modal
- Preview fields modal
- `hooks/use-message-url-state.ts`

### Phase 6: Polish & Migration

**Goal**: Production ready, migrate consumers

1. Skeleton/loading states
2. Error handling and retry UI
3. Accessibility audit
4. Performance optimization (memoization, stable references)
5. Migrate `Tab.Messages` to use `MessageViewer`
6. Migrate pipeline logs to use `MessageViewer`

## Technical Decisions

### Why Two-Table Structure?

```tsx
// Fixed header (outside scroll container)
<Table style={{ tableLayout: 'fixed' }}>
  <colgroup>{/* column widths */}</colgroup>
  <TableHeader>...</TableHeader>
</Table>

// Virtualized body (inside scroll container)
<div ref={scrollContainerRef} className="max-h-[600px] overflow-y-auto">
  <Table style={{ tableLayout: 'fixed' }}>
    <colgroup>{/* same widths */}</colgroup>
    <TableBody>
      {paddingTop > 0 && <PaddingRow height={paddingTop} />}
      {virtualRows.map(...)}
      {paddingBottom > 0 && <PaddingRow height={paddingBottom} />}
    </TableBody>
  </Table>
</div>
```

**Reason**: Sticky header positioning doesn't work reliably when the scroll container wraps the entire table. Separating allows the header to stay fixed while body scrolls.

### Why Not Pure CSS Grid?

Current `LogExplorer` uses CSS Grid (`grid-cols-[130px_65px_120px_1fr]`), which works but:
- Doesn't integrate with TanStack Table's column API
- No column visibility toggle
- No column sorting UI
- Can't reuse `DataTableColumnHeader`, `DataTableFacetedFilter`

Using Table primitives + TanStack Table gives us the full feature set.

### Fixed vs Dynamic Row Heights

**Decision**: Use fixed row height (40-50px) for messages

**Reason**:
- Dynamic heights require `measureElement` which has performance cost
- Messages have predictable content (timestamp, partition, offset, truncated key/value)
- Expanded content goes in detail sheet, not row expansion

### State Management

| State Type | Storage | Reason |
|------------|---------|--------|
| Filter values | URL (nuqs) | Shareable, back/forward navigation |
| Column visibility | Zustand (persisted) | User preference, not shareable |
| Sort state | URL (nuqs) | Shareable |
| JS filters | Session storage | Complex objects, per-topic |
| Deserializers | URL (nuqs) | Shareable |
| Selected message | Local state | Transient UI state |

## Migration Strategy

### Step 1: Feature Parity Verification

Before migration, ensure `MessageViewer` supports:
- [ ] All 5 start offset modes
- [ ] Partition selection
- [ ] JS filter creation/editing/toggle/remove
- [ ] Quick search
- [ ] All deserializer options
- [ ] Column visibility settings
- [ ] Preview field extraction
- [ ] Save to JSON/CSV
- [ ] Copy message/key/value/timestamp
- [ ] Load large message
- [ ] Expanded message view

### Step 2: Parallel Deployment

1. Add feature flag: `useModernMessageViewer`
2. Render both and compare (dev only)
3. Gather feedback

### Step 3: Gradual Rollout

1. Enable for pipeline logs first (simpler use case)
2. Enable for topic messages with feature flag
3. Remove legacy after validation

### Step 4: Cleanup

1. Mark `Tab.Messages/` as deprecated
2. Remove after 2 releases
3. Update documentation

## Scroll State Machine

For tail streaming with bidirectional support, we need a scroll state machine:

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         SCROLL STATES                                    │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌──────────────┐    user scrolls up    ┌──────────────────────────┐   │
│  │              │ ───────────────────►  │                          │   │
│  │  AT_BOTTOM   │                       │  VIEWING_HISTORY         │   │
│  │  (auto-scroll│ ◄───────────────────  │  (paused auto-scroll)    │   │
│  │   enabled)   │    click "scroll to   │                          │   │
│  └──────────────┘    bottom" button     └──────────────────────────┘   │
│         │                                         │                     │
│         │ scroll up                               │ scroll up           │
│         │ near top                                │ near top            │
│         ▼                                         ▼                     │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │                      LOADING_OLDER                                │  │
│  │  - Fetch older messages (startReached)                           │  │
│  │  - Prepend to array                                              │  │
│  │  - Adjust scroll offset to maintain position                     │  │
│  │  - Update firstItemIndex                                         │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### State Behaviors

| State | New Messages Arrive | User Scrolls Up | User Clicks "↓" |
|-------|---------------------|-----------------|-----------------|
| `AT_BOTTOM` | Append + auto-scroll | → `VIEWING_HISTORY` | N/A |
| `VIEWING_HISTORY` | Append (no scroll), show "X new" badge | Stay or → `LOADING_OLDER` | → `AT_BOTTOM` |
| `LOADING_OLDER` | Append (no scroll) | Wait for load | → `AT_BOTTOM` |

### Implementation with use-stick-to-bottom

```typescript
const MessageViewer = () => {
  const { isAtBottom, scrollToBottom } = useStickToBottomContext();
  const [newMessageCount, setNewMessageCount] = useState(0);

  // When new messages arrive
  useEffect(() => {
    if (!isAtBottom) {
      // User is viewing history, show badge instead of scrolling
      setNewMessageCount((prev) => prev + newMessages.length);
    }
    // If isAtBottom, use-stick-to-bottom handles auto-scroll
  }, [newMessages, isAtBottom]);

  return (
    <StickToBottom>
      <StickToBottom.Content>
        {messages.map(...)}
      </StickToBottom.Content>

      {/* "Scroll to bottom" button with new message count */}
      {!isAtBottom && (
        <Button onClick={() => {
          scrollToBottom();
          setNewMessageCount(0);
        }}>
          ↓ {newMessageCount > 0 && `${newMessageCount} new`}
        </Button>
      )}
    </StickToBottom>
  );
};
```

### Combining with Bidirectional Load

For loading older messages when scrolling up:

```typescript
const MessageViewer = () => {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [firstItemIndex, setFirstItemIndex] = useState(10000);

  // Detect scroll near top
  const handleScroll = useCallback(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    // If within 100px of top and not already loading
    if (container.scrollTop < 100 && hasOlderMessages && !isLoadingOlder) {
      loadOlderMessages();
    }
  }, [hasOlderMessages, isLoadingOlder]);

  // After loading older messages, adjust scroll position
  const loadOlderMessages = async () => {
    const container = scrollContainerRef.current;
    const scrollTopBefore = container?.scrollTop ?? 0;

    const olderMessages = await fetchOlderMessages();

    // Prepend messages
    setMessages((prev) => [...olderMessages, ...prev]);
    setFirstItemIndex((prev) => prev - olderMessages.length);

    // Restore scroll position (adjust for prepended content)
    requestAnimationFrame(() => {
      if (container) {
        const addedHeight = olderMessages.length * ROW_HEIGHT;
        container.scrollTop = scrollTopBefore + addedHeight;
      }
    });
  };
};
```

## Performance Targets

| Metric | Target | Measurement |
|--------|--------|-------------|
| Initial render (1000 messages) | < 100ms | Performance.now() |
| Scroll FPS | 60 FPS | DevTools Performance tab |
| Memory (10,000 messages) | < 50MB | DevTools Memory tab |
| Time to first message (streaming) | < 500ms | Custom metric |
| Filter application | < 50ms | User perceived |

## Decisions Made

1. **Bidirectional infinite scroll**: ✅ YES - Support scrolling up to load older messages while in tail mode. Use `firstItemIndex` pattern from react-virtuoso or manual scroll offset adjustment.

2. **Message deduplication**: ✅ Clear and refetch on restart. No complex deduplication tracking.

## Open Questions

1. **Column resize**: Should users be able to resize columns? TanStack Table supports this but adds complexity.

2. **Keyboard navigation**: What keyboard shortcuts should be supported? (j/k for row navigation, Enter for details, etc.)

3. **Library choice for virtualization**:
   - **Option A**: TanStack Virtual + manual scroll offset (more control, already in codebase)
   - **Option B**: react-virtuoso (built-in bidirectional support, new dependency)
   - **Option C**: Hybrid - use-stick-to-bottom for tail mode, TanStack Virtual for historical

4. **Pagination edge case**: When streaming in tail mode, new messages arrive continuously. If user is on "page 2" of paginated view, messages could overflow to next page or shift the current page. Options:
   - Disable pagination during tail mode (virtualized scroll only)
   - Show "X new messages" banner instead of auto-shifting
   - Lock current view until user explicitly refreshes

## Pagination vs Streaming Trade-offs

### The Pagination Problem

When streaming in tail mode with traditional pagination:

```
Page 1: [msg1, msg2, msg3, msg4, msg5]  ← User viewing this
Page 2: [msg6, msg7, msg8, msg9, msg10]

New messages arrive: msg11, msg12, msg13

Page 1: [msg1, msg2, msg3, msg4, msg5]  ← Still showing old data
Page 2: [msg6, msg7, msg8, msg9, msg10]
Page 3: [msg11, msg12, msg13]           ← User might miss these
```

Or worse, with "newest first" sorting:

```
Page 1: [msg13, msg12, msg11, msg10, msg9]  ← Entire page shifted!
Page 2: [msg8, msg7, msg6, msg5, msg4]      ← User was reading msg8, now it's here
```

### Recommendation: Mode-Specific UI

| Mode | UI Pattern |
|------|------------|
| **Tail/Live** | Virtualized scroll only (no pagination). Show "X new messages ↓" button when user scrolls up. |
| **Historical** | Virtualized scroll with "Load more" at bottom. Optional pagination for very large result sets. |
| **Timestamp search** | Virtualized scroll with bidirectional "Load older" / "Load newer" |

### Legacy Behavior (Tab.Messages)

Current legacy implementation uses pagination without streaming. User clicks "Refresh" to get new messages. This is simpler but doesn't support live tail mode.

## References

### Scroll Position Management
- [use-stick-to-bottom (GitHub)](https://github.com/stackblitz-labs/use-stick-to-bottom) - Powers ai-elements chat
- [use-stick-to-bottom (npm)](https://www.npmjs.com/package/use-stick-to-bottom) - Zero-dependency scroll anchoring
- [react-virtuoso bidirectional discussion](https://github.com/petyosi/react-virtuoso/discussions/634) - firstItemIndex pattern
- [react-virtuoso](https://virtuoso.dev/) - Built-in bidirectional support
- [Bidirectional Infinite Scroll StackBlitz](https://stackblitz.com/edit/virtualized-bidirectional-infinite-scroll) - react-window example
- [Stream bidirectional scroll docs](https://getstream.github.io/react-native-bidirectional-infinite-scroll/how-it-works/) - maintainVisibleContentPosition

### TanStack Libraries
- [TanStack Table Virtualization Guide](https://tanstack.com/table/latest/docs/guide/virtualization)
- [TanStack Virtual Infinite Scroll Example](https://tanstack.com/virtual/latest/docs/framework/react/examples/infinite-scroll)
- [TanStack Table Virtualized Infinite Scrolling Example](https://tanstack.com/table/latest/docs/framework/react/examples/virtualized-infinite-scrolling)
- [TanStack Virtual Discussion on Reverse Scroll](https://github.com/TanStack/virtual/discussions/195)

### Terminal/Log Viewers
- [xterm.js scroll-to-bottom issue](https://github.com/xtermjs/xterm.js/issues/1824) - Configurable auto-scroll
- [xterm.js viewport scroll issue](https://github.com/xtermjs/xterm.js/issues/216) - User scroll vs output scroll
- [Kubetail](https://github.com/kubetail-org/kubetail) - Kubernetes log dashboard

### Codebase References
- `src/components/ai-elements/conversation.tsx` - use-stick-to-bottom usage
- `src/components/pages/shadowlinks/details/shadow-topics-table.tsx` - Two-table virtualization pattern
- `src/components/pages/topics/Tab.Messages/index.tsx` - Legacy implementation
