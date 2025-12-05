# Topics E2E Test Plan

## Overview

E2E tests for the Topics page in Redpanda Console, covering topic management, message operations, and configuration viewing.

**Total Tests:** 40 tests across 6 spec files
**Seed:** `tests/seed.spec.ts`

## Routes

- `/topics` - Topic list page
- `/topics/:topicName` - Topic details page with tabs
- `/topics/:topicName/produce-record` - Produce message page

## Test Files

### 1. Topic List - Basic Operations (`topic-list.spec.ts`)

**6 tests** covering list viewing, search, and filtering operations.

#### 1.1 View Topics List
- Navigate to `/topics`
- Verify page elements visible:
  - Create topic button (testId: `create-topic-button`)
  - Search input (testId: `search-field-input`)
  - Show internal topics checkbox (testId: `show-internal-topics-checkbox`)
  - Topics table (testId: `topics-table`)

#### 1.2 Search Topics - Exact Match
- Create test topic with unique name
- Search for the exact topic name
- Verify topic is visible in filtered results
- Search for non-existent topic
- Verify original topic is hidden

#### 1.3 Search Topics - Regex Pattern
- Create 3 topics: 2 with same prefix, 1 different
- Apply regex pattern matching prefix (e.g., `^regex-test.*`)
- Verify matching topics visible
- Verify non-matching topic hidden

#### 1.4 Clear Search Filter
- Create test topic
- Apply search filter that hides the topic
- Clear the search input
- Verify topic becomes visible again

#### 1.5 Toggle Show Internal Topics
- Navigate to topics list
- Uncheck "Show internal topics" checkbox
- Verify internal topics (e.g., `_schemas`) hidden
- Check the checkbox
- Verify internal topics visible

#### 1.6 Persist Internal Topics Setting
- Check "Show internal topics" checkbox
- Verify `_schemas` topic visible
- Reload page
- Verify setting persisted (checkbox still checked, `_schemas` visible)
- Uncheck checkbox and reload
- Verify setting persisted (checkbox unchecked, `_schemas` hidden)

---

### 2. Topic Creation (`topic-creation.spec.ts`)

**7 tests** covering topic creation flows and validation.

#### 2.1 Create Topic with Default Settings
- Navigate to `/topics`
- Click create topic button (testId: `create-topic-button`)
- Verify modal opens, topic name field focused
- Fill topic name (testId: `topic-name`)
- Click create button (testId: `onOk-button`)
- Close success modal (testId: `create-topic-success__close-button`)
- Verify topic appears in list (testId: `topic-link-{topicName}`)

#### 2.2 Create Topic with Custom Configuration
- Open create topic modal
- Fill topic name
- Set partitions to 6 (placeholder: `/partitions/i`)
- Click create
- Close success modal
- Navigate to topic configuration tab
- Verify configuration page loads (testId: `config-group-table`)

#### 2.3 Validate Empty Topic Name
- Open create topic modal
- Leave topic name empty
- Verify create button disabled (testId: `onOk-button`)
- Click cancel to close modal

#### 2.4 Validate Invalid Topic Name Characters
- Open create topic modal
- Enter invalid topic name with spaces and special chars
- If button enabled, click shows validation error
- If button disabled, verify it's disabled
- Modal remains open

#### 2.5 Validate Replication Factor
- Open create topic modal
- Enter topic name
- Try setting replication factor to 999 (placeholder: `/replication/i`)
- Verify validation error appears (if field is enabled)
- Cancel modal

#### 2.6 Cancel Topic Creation
- Open create topic modal
- Fill some values
- Click Cancel button
- Verify modal closes
- Verify topic not created

#### 2.7 Create and Verify in Multiple Views
- Create topic through modal
- Verify in topics list
- Navigate to topic details
- Verify URL matches `/topics/{topicName}`
- Verify topic name displayed
- Navigate back to list
- Verify topic still visible

---

### 3. Topic Details - Navigation and Tabs (`topic-navigation.spec.ts`)

**5 tests** covering topic details navigation and tab functionality.

#### 3.1 Navigate to Topic Details
- Create test topic
- Navigate to topics list
- Click topic link (testId: `topic-link-{topicName}`)
- Verify URL changes to `/topics/{topicName}`
- Verify topic name displayed
- Verify tabs visible (role: `tablist`)

#### 3.2 View Messages Tab (Default)
- Create test topic
- Click topic link
- Verify tablist visible
- Verify Messages tab content visible
- Verify message-related elements present

#### 3.3 Navigate to Tab via URL Hash
- Create test topic
- Navigate directly to `/topics/{topicName}#configuration`
- Verify configuration tab active (testId: `config-group-table`)
- Navigate to `/topics/{topicName}#partitions`
- Verify partitions content visible

#### 3.4 View Configuration Tab with Grouped Settings
- Create test topic
- Navigate to configuration tab
- Verify config groups visible in expected order:
  - Retention, Compaction, Replication, Tiered Storage
  - Write Caching, Iceberg, Schema Registry and Validation
  - Message Handling, Compression, Storage Internals
- Verify at least "Retention" group present
- Verify groups maintain order

#### 3.5 Navigate Back via Breadcrumb
- Create test topic
- Navigate to topic details
- Click "Topics" breadcrumb link
- Verify returns to `/topics` (with optional trailing slash and query params)
- Verify topic visible in list

---

### 4. Produce Messages (`topic-messages-production.spec.ts`)

**7 tests** covering message production operations.

#### 4.1 Produce Simple Text Message
- Create test topic
- Produce message via helper
- Navigate to messages tab
- Verify message content visible

#### 4.2 Produce Message with Key *(skipped)*
- Create test topic
- Navigate to produce page
- Fill key editor (testId: `produce-key-editor`)
- Fill value editor (testId: `produce-value-editor`)
- Click produce button (testId: `produce-button`)
- Verify message produced

#### 4.3 Produce Multiple Messages in Sequence
- Create test topic
- Produce 3 messages sequentially via UI
- Each message: navigate to produce, fill editor, click produce
- Verify each message appears after production
- Navigate to messages tab
- Verify all 3 messages visible

#### 4.4 Produce Large Message
- Create test topic
- Navigate to produce page
- Generate 30KB+ content
- Paste into value editor via clipboard
- Click produce
- Verify "Message size exceeds display limit" warning
- Expand message row
- Verify warning about performance degradation
- Click "Load anyway" button (testId: `load-anyway-button`)
- Verify payload content visible (testId: `payload-content`)

#### 4.5 Navigate to Produce Page
- Create test topic
- Navigate to produce page
- Verify produce button visible (testId: `produce-button`)
- Verify value editor visible (testId: `produce-value-editor`)
- Verify key editor visible (testId: `produce-key-editor`)
- Verify heading indicates produce/publish

#### 4.6 Handle Empty Message Production
- Create test topic
- Navigate to produce page
- Click in value editor but don't enter text
- Click produce button
- Verify no crash occurs (wait 2 seconds)

#### 4.7 Clear Editor Between Produces
- Create test topic
- Navigate to produce page, produce first message
- Navigate to produce page again
- Clear editor (Ctrl+A or Meta+A, then Backspace)
- Produce second message
- Navigate to messages tab
- Verify both messages exist

---

### 5. View and Filter Messages (`topic-messages-filtering.spec.ts`)

**8 tests** covering message viewing and filtering operations.

#### 5.1 Expand Message to View Details
- Create topic and produce message
- Navigate to messages tab
- Verify message content visible
- Click expand button (label: "Collapse row")
- Verify expanded details visible (testId: `payload-content`)
- Verify metadata visible (Offset/Partition/Timestamp)

#### 5.2 Search Message Content
- Create topic and produce 2 messages (one with keyword, one without)
- Navigate to messages tab
- Find search input (placeholder: `/search|filter/i`)
- Enter search term and press Enter
- Verify matching message visible
- (Behavior depends on implementation for non-matching)

#### 5.3 Filter Messages by Partition *(skipped)*
- Create topic and produce message
- Look for partition filter dropdown
- Select partition 0
- Verify messages filter to selected partition

#### 5.4 Filter Messages by Offset
- Create topic and produce 3 messages
- Navigate to messages tab
- Find offset input (placeholder: `/offset/i`)
- Set start offset to 1 (skip first message)
- Press Enter and wait
- Verify filtered messages visible

#### 5.5 Clear All Filters
- Create topic and produce message
- Apply search filter
- Look for clear/reset button (role: `button`, name: `/clear|reset/i`)
- Click clear button
- Verify message becomes visible again

#### 5.6 Handle Empty Topic
- Create empty topic (no messages)
- Navigate to messages tab
- Verify empty state message visible (text: `/No messages|empty/i`)
- Verify produce button still available

#### 5.7 Handle Rapid Filter Changes
- Create topic and produce message
- Navigate to messages tab
- Rapidly change search terms multiple times
- Clear and enter final search term
- Verify handles gracefully without errors
- Verify message displays correctly

#### 5.8 Preserve Filters in URL Parameters
- Create topic and produce message
- Navigate to messages tab
- Enter search term in quick search and press Enter
- Verify URL contains filter parameter (e.g., `q=test-search`)
- Reload page
- Verify URL still contains parameter
- Verify search input has the value
- (Uses testId: `message-quick-search-input`)

---

### 6. Message Actions and Export (`topic-messages-actions.spec.ts`)

**7 tests** covering message actions like copy, export, and viewing metadata.

**Note:** Tests use `permissions: ['clipboard-write', 'clipboard-read']`

#### 6.1 Copy Message Value to Clipboard
- Create topic and produce message
- Navigate to messages tab
- Expand first message
- Click copy value button (role: `button`, name: `/copy value/i`)
- Verify clipboard content matches message value
- Verify success toast visible: "Value copied to clipboard"

#### 6.2 Export Single Message as JSON
- Create topic and produce message
- Navigate to messages tab
- Expand first message
- Click "Download Record"
- JSON format selected by default
- Click save in dialog (role: `dialog`, name: `/save message/i`)
- Verify download with `.json` extension
- Save and verify file content contains message

#### 6.3 Export Single Message as CSV
- Create topic and produce message
- Navigate to messages tab
- Expand first message
- Click "Download Record"
- Select CSV format (testId: `csv_field`)
- Click "Save Messages" in dialog
- Verify download as `messages.csv`
- Verify file content contains message

#### 6.4 Export Message with Special Characters
- Create topic and produce message with special chars (quotes, commas, emojis)
- Navigate to messages tab
- Expand message and export as JSON
- Verify special characters preserved in file

#### 6.5 Open and Cancel Export Dialog
- Create topic and produce message
- Navigate to messages tab
- Expand message
- Click "Download Record"
- Verify dialog opens (role: `dialog`, name: `/save message/i`)
- Click Cancel button
- Verify dialog closes

#### 6.6 Handle Large Payload Export
- Create topic
- Navigate to produce page and create 30KB+ message
- Verify "Message size exceeds display limit" warning
- Expand message row
- Click "Load anyway" button (testId: `load-anyway-button`)
- Export message as JSON
- Verify file size > 1KB
- Verify payload content loads

#### 6.7 View Message Metadata
- Create topic and produce message
- Navigate to messages tab
- Expand first message
- Verify metadata visible:
  - Offset/offset (case insensitive)
  - Partition/partition
  - Timestamp/timestamp
- Verify payload content visible (testId: `payload-content`)

---

## Implementation Details

### Test Utilities

All tests use the `TopicPage` Page Object Model:

```typescript
import { TopicPage } from '../utils/TopicPage';

const topicPage = new TopicPage(page);

// High-level operations
await topicPage.createTopic(topicName);
await topicPage.deleteTopic(topicName);
await topicPage.produceMessage(topicName, message);

// Navigation
await topicPage.goToTopicsList();
await topicPage.goToTopicDetails(topicName);
await topicPage.goToProduceRecord(topicName);

// List operations
await topicPage.searchTopics(searchTerm);
await topicPage.toggleInternalTopics(checked);
await topicPage.verifyTopicInList(topicName);
```

### Test IDs Used

**Topic List:**
- `create-topic-button` - Create topic button
- `search-field-input` - Search input field
- `show-internal-topics-checkbox` - Internal topics toggle
- `topics-table` - Topics data table
- `topic-link-{topicName}` - Dynamic topic link
- `delete-topic-button-{topicName}` - Delete button per topic
- `delete-topic-confirm-button` - Confirm delete button

**Topic Creation:**
- `topic-name` - Topic name input field
- `onOk-button` - Create/submit button
- `create-topic-success__close-button` - Close success modal

**Topic Details:**
- `config-group-table` - Configuration groups table
- `produce-record-button` - Produce button in details
- Use `role='tablist'` for tabs

**Produce Messages:**
- `produce-button` - Produce message button
- `produce-value-editor` - Value editor (Monaco)
- `produce-key-editor` - Key editor (Monaco)
- `load-anyway-button` - Load large message button
- `payload-content` - Message payload display

**Messages Tab:**
- `message-quick-search-input` - Quick search input
- `data-table-cell` - Table cells
- Use `aria-label="Collapse row"` for expand buttons

**Export:**
- `csv_field` - CSV format selection
- Use `role='dialog'` with `name=/save message/i` for export dialog

### Cleanup

All tests use `TopicPage.deleteTopic()` in teardown to clean up created topics.

### Skipped Tests

Some tests are marked as `test.skip()`:
- Produce message with key - Needs stable key editor interaction
- Filter messages by partition - Needs better select control handling

### Notes

- Tests create topics with unique names using `Date.now()` timestamps
- Tests verify both UI state and data consistency
- URL parameter preservation is tested for search filters
- Internal topics (`_schemas`) are used to test visibility toggle
- Large message tests use 30KB+ content to trigger size warnings
- Special characters testing includes quotes, commas, and emojis
- All tests are self-contained with setup and teardown
