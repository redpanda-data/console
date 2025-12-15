---
name: e2e-tester
description: "Write and run Playwright E2E tests for Redpanda Console using testcontainers. Analyzes test failures, adds missing testids, and improves test stability. Use when user requests E2E tests, Playwright tests, integration tests, test failures, missing testids, or mentions 'test workflow', 'browser testing', 'end-to-end', or 'testcontainers'."
allowed-tools: Read, Write, Edit, Bash, Glob, Grep, Task, mcp__ide__getDiagnostics, mcp__playwright-test__test_run, mcp__playwright-test__test_list, mcp__playwright-test__test_debug
---

# E2E Testing with Playwright & Testcontainers

Write end-to-end tests using Playwright against a full Redpanda Console stack running in Docker containers via testcontainers.

## Critical Rules

**ALWAYS:**

- Run `bun run build` before running E2E tests (frontend assets required)
- Use `testcontainers` API for container management (never manual `docker` commands in tests)
- Test complete user workflows (multi-page, multi-step scenarios)
- Use `page.getByRole()` and `page.getByLabel()` selectors (avoid CSS selectors)
- Add `data-testid` attributes to components when semantic selectors aren't available
- Use Task tool with MCP Playwright agents to analyze failures and get test status
- Use Task tool with Explore agent to find missing testids in UI components
- Clean up test data after tests complete

**NEVER:**

- Test UI component rendering (that belongs in unit/integration tests)
- Use brittle CSS selectors like `.class-name` or `#id`
- Use force:true when calling .click()
- Use waitForTimeout in e2e tests
- Hard-code wait times (use `waitFor` with conditions)
- Leave containers running after test failures
- Commit test screenshots to git (add to `.gitignore`)
- Add testids without understanding the component's purpose and context

## Test Architecture

### Stack Components

**OSS Mode (`bun run e2e-test`):**
- Redpanda container (Kafka broker + Schema Registry + Admin API)
- Backend container (Go binary serving API + embedded frontend)
- OwlShop container (test data generator)

**Enterprise Mode (`bun run e2e-test-enterprise`):**
- Same as OSS + Enterprise features (RBAC, SSO, etc.)
- Requires `console-enterprise` repo checked out alongside `console`

**Network Setup:**
- All containers on shared Docker network
- Internal addresses: `redpanda:9092`, `console-backend:3000`
- External access: `localhost:19092`, `localhost:3000`

### Test Container Lifecycle

```
Setup (global-setup.mjs):
1. Build frontend (frontend/build/)
2. Copy frontend assets to backend/pkg/embed/frontend/
3. Build backend Docker image with testcontainers
4. Start Redpanda container with SASL auth
5. Start backend container serving frontend
6. Wait for services to be ready

Tests run...

Teardown (global-teardown.mjs):
1. Stop backend container
2. Stop Redpanda container
3. Remove Docker network
4. Clean up copied frontend assets
```

## Workflow

### 1. Prerequisites

```bash
# Build frontend (REQUIRED before E2E tests)
bun run build

# Verify Docker is running
docker ps
```

### 2. Write Test

**File location:** `tests/<feature>/*.spec.ts`

**Structure:**

```typescript
import { test, expect } from '@playwright/test';

test.describe('Feature Name', () => {
  test('user can complete workflow', async ({ page }) => {
    // Navigate to page
    await page.goto('/feature');

    // Interact with elements
    await page.getByRole('button', { name: 'Create' }).click();
    await page.getByLabel('Name').fill('test-item');

    // Submit and verify
    await page.getByRole('button', { name: 'Submit' }).click();
    await expect(page.getByText('Success')).toBeVisible();

    // Verify navigation or state change
    await expect(page).toHaveURL(/\/feature\/test-item/);
  });
});
```

### 3. Selectors Best Practices

**Prefer accessibility selectors:**

```typescript
// ✅ GOOD: Role-based (accessible)
page.getByRole('button', { name: 'Create Topic' })
page.getByLabel('Topic Name')
page.getByText('Success message')

// ✅ GOOD: Test IDs when role isn't clear
page.getByTestId('topic-list-item')

// ❌ BAD: CSS selectors (brittle)
page.locator('.btn-primary')
page.locator('#topic-name-input')
```

**Add test IDs to components:**

```typescript
// In React component
<Button data-testid="create-topic-button">
  Create Topic
</Button>

// In test
await page.getByTestId('create-topic-button').click();
```

### 4. Async Operations

```typescript
// ✅ GOOD: Wait for specific condition
await expect(page.getByRole('status')).toHaveText('Ready');

// ✅ GOOD: Wait for navigation
await page.waitForURL('**/topics/my-topic');

// ✅ GOOD: Wait for API response
await page.waitForResponse(resp =>
  resp.url().includes('/api/topics') && resp.status() === 200
);

// ❌ BAD: Fixed timeouts
await page.waitForTimeout(5000);
```

### 5. Authentication

**OSS Mode:** No authentication required

**Enterprise Mode:** Basic auth with `e2euser:very-secret`

```typescript
test.use({
  httpCredentials: {
    username: 'e2euser',
    password: 'very-secret',
  },
});
```

### 6. Run Tests

```bash
# OSS tests
bun run build                 # Build frontend first!
bun run e2e-test              # Run all OSS tests

# Enterprise tests (requires console-enterprise repo)
bun run build
bun run e2e-test-enterprise

# UI mode (debugging)
bun run e2e-test:ui

# Specific test file
bun run e2e-test tests/topics/create-topic.spec.ts

# Update snapshots
bun run e2e-test --update-snapshots
```

### 7. Debugging

**Failed test debugging:**

```bash
# Check container logs
docker ps -a | grep console-backend
docker logs <container-id>

# Check if services are accessible
curl http://localhost:3000
curl http://localhost:19092

# Run with debug output
DEBUG=pw:api bun run e2e-test

# Keep containers running on failure
TESTCONTAINERS_RYUK_DISABLED=true bun run e2e-test
```

**Playwright debugging tools:**

```typescript
// Add to test for debugging
await page.pause();  // Opens Playwright Inspector

// Screenshot on failure (automatic in config)
await page.screenshot({ path: 'debug.png' });

// Get page content for debugging
console.log(await page.content());
```

## Common Patterns

### Multi-Step Workflows

```typescript
test('user creates, configures, and tests topic', async ({ page }) => {
  // Step 1: Navigate and create
  await page.goto('/topics');
  await page.getByRole('button', { name: 'Create Topic' }).click();

  // Step 2: Fill form
  await page.getByLabel('Topic Name').fill('test-topic');
  await page.getByLabel('Partitions').fill('3');
  await page.getByRole('button', { name: 'Create' }).click();

  // Step 3: Verify creation
  await expect(page.getByText('Topic created successfully')).toBeVisible();
  await expect(page).toHaveURL(/\/topics\/test-topic/);

  // Step 4: Configure topic
  await page.getByRole('button', { name: 'Configure' }).click();
  await page.getByLabel('Retention Hours').fill('24');
  await page.getByRole('button', { name: 'Save' }).click();

  // Step 5: Verify configuration
  await expect(page.getByText('Configuration saved')).toBeVisible();
});
```

### Testing Forms

```typescript
test('form validation works correctly', async ({ page }) => {
  await page.goto('/create-topic');

  // Submit empty form - should show errors
  await page.getByRole('button', { name: 'Create' }).click();
  await expect(page.getByText('Name is required')).toBeVisible();

  // Fill valid data - should succeed
  await page.getByLabel('Topic Name').fill('valid-topic');
  await page.getByRole('button', { name: 'Create' }).click();
  await expect(page.getByText('Success')).toBeVisible();
});
```

### Testing Data Tables

```typescript
test('user can filter and sort topics', async ({ page }) => {
  await page.goto('/topics');

  // Filter
  await page.getByPlaceholder('Search topics').fill('test-');
  await expect(page.getByRole('row')).toHaveCount(3); // Header + 2 results

  // Sort
  await page.getByRole('columnheader', { name: 'Name' }).click();
  const firstRow = page.getByRole('row').nth(1);
  await expect(firstRow).toContainText('test-topic-a');
});
```

### API Interactions

```typescript
test('creating topic triggers backend API', async ({ page }) => {
  // Listen for API call
  const apiPromise = page.waitForResponse(
    resp => resp.url().includes('/api/topics') && resp.status() === 201
  );

  // Trigger action
  await page.goto('/topics');
  await page.getByRole('button', { name: 'Create Topic' }).click();
  await page.getByLabel('Name').fill('api-test-topic');
  await page.getByRole('button', { name: 'Create' }).click();

  // Verify API was called
  const response = await apiPromise;
  const body = await response.json();
  expect(body.name).toBe('api-test-topic');
});
```

## Testcontainers Setup

### Frontend Asset Copy (Required)

The backend Docker image needs frontend assets embedded at build time:

```typescript
// In global-setup.mjs
async function buildBackendImage(isEnterprise) {
  // Copy frontend build to backend embed directory
  const frontendBuildDir = resolve(__dirname, '../build');
  const embedDir = join(backendDir, 'pkg/embed/frontend');
  await execAsync(`cp -r "${frontendBuildDir}"/* "${embedDir}"/`);

  // Build Docker image using testcontainers
  // Docker doesn't allow referencing files outside build context,
  // so we temporarily copy the Dockerfile into the build context
  const tempDockerfile = join(backendDir, '.dockerfile.e2e.tmp');
  await execAsync(`cp "${dockerfilePath}" "${tempDockerfile}"`);

  try {
    await GenericContainer
      .fromDockerfile(backendDir, '.dockerfile.e2e.tmp')
      .build(imageTag, { deleteOnExit: false });
  } finally {
    await execAsync(`rm -f "${tempDockerfile}"`).catch(() => {});
    await execAsync(`find "${embedDir}" -mindepth 1 ! -name '.gitignore' -delete`).catch(() => {});
  }
}
```

### Container Configuration

**Backend container:**
```typescript
const backend = await new GenericContainer(imageTag)
  .withNetwork(network)
  .withNetworkAliases('console-backend')
  .withExposedPorts({ container: 3000, host: 3000 })
  .withBindMounts([{
    source: configPath,
    target: '/etc/console/config.yaml'
  }])
  .withCommand(['--config.filepath=/etc/console/config.yaml'])
  .start();
```

**Redpanda container:**
```typescript
const redpanda = await new GenericContainer('redpandadata/redpanda:v25.2.1')
  .withNetwork(network)
  .withNetworkAliases('redpanda')
  .withExposedPorts(
    { container: 19_092, host: 19_092 },  // Kafka
    { container: 18_081, host: 18_081 },  // Schema Registry
    { container: 9644, host: 19_644 }     // Admin API
  )
  .withEnvironment({ RP_BOOTSTRAP_USER: 'e2euser:very-secret' })
  .withHealthCheck({
    test: ['CMD-SHELL', "rpk cluster health | grep -E 'Healthy:.+true' || exit 1"],
    interval: 15_000,
    retries: 5
  })
  .withWaitStrategy(Wait.forHealthCheck())
  .start();
```

## CI Integration

### GitHub Actions Setup

```yaml
e2e-test:
  runs-on: ubuntu-latest-8
  steps:
    - uses: actions/checkout@v5
    - uses: oven-sh/setup-bun@v2

    - name: Install dependencies
      run: bun install --frozen-lockfile

    - name: Build frontend
      run: |
        REACT_APP_CONSOLE_GIT_SHA=$(echo $GITHUB_SHA | cut -c 1-6)
        bun run build

    - name: Install Playwright browsers
      run: bun run install:chromium

    - name: Run E2E tests
      run: bun run e2e-test

    - name: Upload test report
      if: failure()
      uses: actions/upload-artifact@v4
      with:
        name: playwright-report
        path: frontend/playwright-report/
```

## Test ID Management

### Finding Missing Test IDs

Use the Task tool with Explore agent to systematically find missing testids:

```
Use Task tool with:
subagent_type: Explore
prompt: Search through [feature] UI components and identify all interactive
        elements (buttons, inputs, links, selects) missing data-testid attributes.
        List with file:line, element type, purpose, and suggested testid name.
```

**Example output:**
```
schema-list.tsx:207 - button - "Edit compatibility" - schema-edit-compatibility-btn
schema-list.tsx:279 - button - "Create new schema" - schema-create-new-btn
schema-details.tsx:160 - button - "Edit compatibility" - schema-details-edit-compatibility-btn
```

### Adding Test IDs

**Naming Convention:**
- Use kebab-case: `data-testid="feature-action-element"`
- Be specific: Include feature name + action + element type
- For dynamic items: Use template literals `data-testid={\`item-delete-\${id}\`}`

**Examples:**

```tsx
// ✅ GOOD: Specific button action
<Button data-testid="schema-create-new-btn" onClick={onCreate}>
  Create new schema
</Button>

// ✅ GOOD: Form input with context
<Input
  data-testid="schema-subject-name-input"
  placeholder="Subject name"
/>

// ✅ GOOD: Table row with dynamic ID
<TableRow data-testid={`schema-row-${schema.name}`}>
  {schema.name}
</TableRow>

// ✅ GOOD: Delete button in list
<IconButton
  data-testid={`schema-delete-btn-${schema.name}`}
  icon={<TrashIcon />}
  onClick={() => deleteSchema(schema.name)}
/>

// ❌ BAD: Too generic
<Button data-testid="button">Create</Button>

// ❌ BAD: Using CSS classes as identifiers
<Button className="create-btn">Create</Button>
```

**Where to Add:**
1. **Primary actions**: Create, Save, Delete, Edit, Submit, Cancel buttons
2. **Navigation**: Links to detail pages, breadcrumbs
3. **Forms**: All input fields, selects, checkboxes, radio buttons
4. **Lists/Tables**: Row identifiers, action buttons within rows
5. **Dialogs/Modals**: Open/close buttons, form elements inside
6. **Search/Filter**: Search inputs, filter dropdowns, clear buttons

**Process:**
1. Use Task/Explore to find missing testids in target feature
2. Read the component file to understand context
3. Add `data-testid` following naming convention
4. Update tests to use new testids
5. Run tests to verify selectors work

## Analyzing Test Failures

### Using MCP Playwright Agents

**Check Test Status:**
```typescript
// Use mcp__playwright-test__test_list to see all tests
// Use mcp__playwright-test__test_run to get detailed results
// Use mcp__playwright-test__test_debug to analyze specific failures
```

### Reading Playwright Logs

**Common failure patterns and fixes:**

#### 1. Element Not Found
```
Error: locator.click: Target closed
Error: Timeout 30000ms exceeded waiting for locator
```

**Analysis steps:**
1. Check if element has correct testid/role
2. Verify element is visible (not hidden/collapsed)
3. Check for timing issues (element loads async)
4. Look for dynamic content that changes selector

**Fix:**
```typescript
// ❌ BAD: Element might not be loaded
await page.getByRole('button', { name: 'Create' }).click();

// ✅ GOOD: Wait for element to be visible
await expect(page.getByRole('button', { name: 'Create' })).toBeVisible();
await page.getByRole('button', { name: 'Create' }).click();

// ✅ BETTER: Add testid for stability
await page.getByTestId('create-button').click();
```

#### 2. Selector Ambiguity
```
Error: strict mode violation: locator('button') resolved to 3 elements
```

**Analysis:**
- Multiple elements match the selector
- Need more specific selector or testid

**Fix:**
```typescript
// ❌ BAD: Multiple "Edit" buttons on page
await page.getByRole('button', { name: 'Edit' }).click();

// ✅ GOOD: More specific with testid
await page.getByTestId('schema-edit-compatibility-btn').click();

// ✅ GOOD: Scope within container
await page.getByRole('region', { name: 'Schema Details' })
          .getByRole('button', { name: 'Edit' }).click();
```

#### 3. Timing/Race Conditions
```
Error: expect(locator).toHaveText()
Expected string: "Success"
Received string: "Loading..."
```

**Analysis:**
- Test assertion ran before UI updated
- Need to wait for specific state

**Fix:**
```typescript
// ❌ BAD: Doesn't wait for state change
await page.getByRole('button', { name: 'Save' }).click();
expect(page.getByText('Success')).toBeVisible();

// ✅ GOOD: Wait for the expected state
await page.getByRole('button', { name: 'Save' }).click();
await expect(page.getByText('Success')).toBeVisible({ timeout: 5000 });
```

#### 4. Navigation Issues
```
Error: page.goto: net::ERR_CONNECTION_REFUSED
```

**Analysis:**
- Backend/frontend not running
- Wrong URL or port

**Fix:**
```bash
# Check containers are running
docker ps | grep console-backend

# Check container logs
docker logs <container-id>

# Verify port mapping
curl http://localhost:3000

# Check testcontainer state file
cat .testcontainers-state.json
```

### Systematic Failure Analysis Workflow

**When tests fail:**

1. **Get Test Results**
   ```
   Use mcp__playwright-test__test_run or check console output
   Identify which tests failed and error messages
   ```

2. **Analyze Error Patterns**
   - Selector not found → Missing/wrong testid or element not visible
   - Strict mode violation → Need more specific selector
   - Timeout → Element loads async, need waitFor
   - Connection refused → Container/service not running

3. **Find Missing Test IDs**
   ```
   Use Task tool with Explore agent to find missing testids in the
   components related to failed tests
   ```

4. **Add Test IDs**
   - Read component file
   - Add `data-testid` to problematic elements
   - Follow naming convention
   - Format with biome

5. **Update Tests**
   - Replace brittle selectors with stable testids
   - Add proper wait conditions
   - Verify with test run

6. **Verify Fixes**
   ```
   Run specific test file to verify fix
   Run full suite to ensure no regressions
   ```

## Troubleshooting

### Container Fails to Start

```bash
# Check if frontend build exists
ls frontend/build/

# Check if Docker image built successfully
docker images | grep console-backend

# Check container logs
docker logs <container-id>

# Verify Docker network
docker network ls | grep testcontainers
```

### Test Timeout Issues

```typescript
// Increase timeout for slow operations
test('slow operation', async ({ page }) => {
  test.setTimeout(60000); // 60 seconds

  await page.goto('/slow-page');
  await expect(page.getByText('Loaded')).toBeVisible({ timeout: 30000 });
});
```

### Port Already in Use

```bash
# Find and kill process using port 3000
lsof -ti:3000 | xargs kill -9

# Or use different ports in test config
```

## Quick Reference

**Test types:**
- E2E tests (`*.spec.ts`): Complete user workflows, browser interactions
- Integration tests (`*.test.tsx`): Component + API, no browser
- Unit tests (`*.test.ts`): Pure logic, utilities

**Commands:**
```bash
bun run build                # Build frontend (REQUIRED first!)
bun run e2e-test             # Run OSS E2E tests
bun run e2e-test-enterprise  # Run Enterprise E2E tests
bun run e2e-test:ui          # Playwright UI mode (debugging)
```

**Selector priority:**
1. `getByRole()` - Best for accessibility
2. `getByLabel()` - For form inputs
3. `getByText()` - For content verification
4. `getByTestId()` - When semantic selectors aren't clear
5. CSS selectors - Avoid if possible

**Wait strategies:**
- `waitForURL()` - Navigation complete
- `waitForResponse()` - API call finished
- `waitFor()` with `expect()` - Element state changed
- Never use fixed `waitForTimeout()` unless absolutely necessary

## Output

After completing work:

1. Confirm frontend build succeeded
2. Verify all E2E tests pass
3. Note any new test IDs added to components
4. Mention cleanup of test containers
5. Report test execution time and coverage