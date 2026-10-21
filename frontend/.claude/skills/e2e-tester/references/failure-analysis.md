# Failure Analysis Reference

## CLI and artifacts

Run `bun run e2e-test:variant console list --summary` to collect tests without services.
Run `bun run e2e-test:variant console topics/topic-list.spec.ts` to reproduce against the
real stack. Inspect `.rstest/` screenshots, first-retry videos and Playwright traces.
Enterprise screenshots/videos remain disabled. Use native locators/DOM inspection for
selector diagnosis; do not replace real E2E coverage with mocked component tests.

## Common Failure Patterns

### 1. Element Not Found

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
// BAD: Element might not be loaded
await page.getByRole('button', { name: 'Create' }).click();

// GOOD: Wait for element to be visible
await expect(page.getByRole('button', { name: 'Create' })).toBeVisible();
await page.getByRole('button', { name: 'Create' }).click();

// BETTER: Add testid for stability
await page.getByTestId('create-button').click();
```

### 2. Selector Ambiguity

```
Error: strict mode violation: locator('button') resolved to 3 elements
```

**Fix:**
```typescript
// BAD: Multiple "Edit" buttons on page
await page.getByRole('button', { name: 'Edit' }).click();

// GOOD: More specific with testid
await page.getByTestId('schema-edit-compatibility-btn').click();

// GOOD: Scope within container
await page.getByRole('region', { name: 'Schema Details' })
          .getByRole('button', { name: 'Edit' }).click();
```

### 3. Timing/Race Conditions

```
Error: expect(locator).toHaveText()
Expected string: "Success"
Received string: "Loading..."
```

**Fix:**
```typescript
// BAD: Doesn't wait for state change
await page.getByRole('button', { name: 'Save' }).click();
expect(page.getByText('Success')).toBeVisible();

// GOOD: Wait for the expected state
await page.getByRole('button', { name: 'Save' }).click();
await expect(page.getByText('Success')).toBeVisible({ timeout: 5000 });
```

### 4. Navigation Issues

```
Error: page.goto: net::ERR_CONNECTION_REFUSED
```

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

## Systematic Failure Analysis Workflow

1. **Get Test Results** — Run the relevant variant CLI and inspect console/artifact output
2. **Analyze Error Patterns:**
   - Selector not found -> Missing/wrong testid or element not visible
   - Strict mode violation -> Need more specific selector
   - Timeout -> Element loads async, need waitFor
   - Connection refused -> Container/service not running
3. **Find Missing Test IDs** — Inspect semantic roles and labels in the source and browser
4. **Add Test IDs** — Read component, add `data-testid`, follow naming convention
5. **Update Tests** — Replace brittle selectors with stable testids, add wait conditions
6. **Verify Fixes** — Run specific test file, then full suite

## Debugging Commands

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

**In-test debugging:**
```typescript
await page.pause();  // Opens Playwright Inspector
await page.screenshot({ path: 'debug.png' });
console.log(await page.content());
```

## Test Timeout Issues

```typescript
// Increase timeout for slow operations
test('slow operation', async ({ page }) => {
  test.setTimeout(60000); // 60 seconds
  await page.goto('/slow-page');
  await expect(page.getByText('Loaded')).toBeVisible({ timeout: 30000 });
});
```
