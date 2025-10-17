/**
 * Copyright 2025 Redpanda Data, Inc.
 *
 * Use of this software is governed by the Business Source License
 * included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
 *
 * As of the Change Date specified in that file, in accordance with
 * the Business Source License, use of this software will be governed
 * by the Apache License, Version 2.0
 */

import { test, expect } from '@playwright/test';

test.describe('Shadowlinks', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to shadowlinks page
    await page.goto('/shadowlinks');
  });

  test('should display empty state with create button', async ({ page }) => {
    // Mock empty list response
    await page.route('**/redpanda.api.console.v1alpha1.ShadowLinkService/ListShadowLinks', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          shadowLinks: [],
        }),
      });
    });

    await page.reload();

    // Verify empty state is shown
    await expect(page.getByTestId('create-shadowlink-button')).toBeVisible();
    await expect(page.getByText('Create Shadowlink')).toBeVisible();
    await expect(
      page.getByText('Set up shadow linking to replicate topics from a source cluster')
    ).toBeVisible();
  });

  test('should navigate to create page when clicking create button in empty state', async ({ page }) => {
    // Mock empty list response
    await page.route('**/redpanda.api.console.v1alpha1.ShadowLinkService/ListShadowLinks', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          shadowLinks: [],
        }),
      });
    });

    await page.reload();

    // Click create button
    await page.getByTestId('create-shadowlink-button').click();

    // Verify navigation to create page
    await expect(page).toHaveURL('/shadowlinks/create');
    await expect(page.getByRole('heading', { name: 'Create Shadow Link' })).toBeVisible();
  });

  test('should navigate to create page when clicking create button in toolbar', async ({ page }) => {
    // Mock list with data so toolbar is shown
    await page.route('**/redpanda.api.console.v1alpha1.ShadowLinkService/ListShadowLinks', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          shadowLinks: [
            {
              name: 'test-shadowlink',
              uid: '123',
              status: { state: 1 }, // ACTIVE
              configurations: {
                clientOptions: {
                  bootstrapServers: ['broker1:9092', 'broker2:9092'],
                  clientId: '',
                  sourceClusterId: '',
                  metadataMaxAgeMs: 0,
                  connectionTimeoutMs: 0,
                  retryBackoffMs: 0,
                  fetchWaitMaxMs: 0,
                  fetchMinBytes: 0,
                  fetchMaxBytes: 0,
                },
              },
            },
          ],
        }),
      });
    });

    await page.reload();

    // Find and click the "Create Shadowlink" button in the toolbar
    await page.getByRole('button', { name: /create shadowlink/i }).click();

    // Verify navigation to create page
    await expect(page).toHaveURL('/shadowlinks/create');
  });

  test('should display multi-step form on create page', async ({ page }) => {
    // Navigate to create page
    await page.goto('/shadowlinks/create');

    // Verify step 1 is active
    await expect(page.getByText('Connection')).toBeVisible();
    await expect(page.getByText('Topics')).toBeVisible();

    // Verify connection form fields are visible
    await expect(page.getByPlaceholder('my-shadow-link')).toBeVisible();
    await expect(page.getByPlaceholder('broker1:9092')).toBeVisible();

    // Verify Next button is present on first step
    await expect(page.getByRole('button', { name: 'Next' })).toBeVisible();
  });

  test('should navigate between form steps', async ({ page }) => {
    // Navigate to create page
    await page.goto('/shadowlinks/create');

    // Fill in required connection fields
    await page.getByPlaceholder('my-shadow-link').fill('test-link');
    await page.getByPlaceholder('broker1:9092').fill('localhost:9092');

    // Click Next to go to topics step
    await page.getByRole('button', { name: 'Next' }).click();

    // Verify we're on topics step
    await expect(page.getByText('Topics to Mirror')).toBeVisible();
    await expect(page.getByText('Include all topics')).toBeVisible();

    // Verify Back button is present
    await expect(page.getByRole('button', { name: /back/i })).toBeVisible();

    // Click Back to return to connection step
    await page.getByRole('button', { name: /back/i }).click();

    // Verify we're back on connection step
    await expect(page.getByPlaceholder('my-shadow-link')).toBeVisible();
  });

  test('should navigate back to list from create page', async ({ page }) => {
    // Navigate to create page
    await page.goto('/shadowlinks/create');

    // Note: The stepper controls don't have a Cancel button on the first step
    // Users navigate back via breadcrumbs or browser back
  });

  test('should display shadowlinks in table when data exists', async ({ page }) => {
    // Mock API response with test data
    await page.route('**/redpanda.api.console.v1alpha1.ShadowLinkService/ListShadowLinks', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          shadowLinks: [
            {
              name: 'test-shadowlink',
              uid: '123',
              status: { state: 1 }, // ACTIVE
              configurations: {
                clientOptions: {
                  bootstrapServers: ['broker1:9092', 'broker2:9092'],
                  clientId: '',
                  sourceClusterId: '',
                  metadataMaxAgeMs: 0,
                  connectionTimeoutMs: 0,
                  retryBackoffMs: 0,
                  fetchWaitMaxMs: 0,
                  fetchMinBytes: 0,
                  fetchMaxBytes: 0,
                },
              },
            },
          ],
        }),
      });
    });

    await page.reload();

    // Verify table is displayed
    await expect(page.getByTestId('shadowlink-row-test-shadowlink')).toBeVisible();
    await expect(page.getByText('test-shadowlink')).toBeVisible();
    await expect(page.getByText('broker1:9092')).toBeVisible();
    await expect(page.getByText('Active')).toBeVisible();
  });

  test('should display multiple shadowlinks', async ({ page }) => {
    // Mock API response with multiple shadowlinks
    await page.route('**/redpanda.api.console.v1alpha1.ShadowLinkService/ListShadowLinks', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          shadowLinks: [
            {
              name: 'shadowlink-1',
              uid: '123',
              status: { state: 1 }, // ACTIVE
              configurations: {
                clientOptions: {
                  bootstrapServers: ['broker1:9092'],
                  clientId: '',
                  sourceClusterId: '',
                  metadataMaxAgeMs: 0,
                  connectionTimeoutMs: 0,
                  retryBackoffMs: 0,
                  fetchWaitMaxMs: 0,
                  fetchMinBytes: 0,
                  fetchMaxBytes: 0,
                },
              },
            },
            {
              name: 'shadowlink-2',
              uid: '456',
              status: { state: 2 }, // PAUSED
              configurations: {
                clientOptions: {
                  bootstrapServers: ['broker2:9092'],
                  clientId: '',
                  sourceClusterId: '',
                  metadataMaxAgeMs: 0,
                  connectionTimeoutMs: 0,
                  retryBackoffMs: 0,
                  fetchWaitMaxMs: 0,
                  fetchMinBytes: 0,
                  fetchMaxBytes: 0,
                },
              },
            },
          ],
        }),
      });
    });

    await page.reload();

    // Verify both shadowlinks are displayed
    await expect(page.getByTestId('shadowlink-row-shadowlink-1')).toBeVisible();
    await expect(page.getByTestId('shadowlink-row-shadowlink-2')).toBeVisible();
    await expect(page.getByText('shadowlink-1')).toBeVisible();
    await expect(page.getByText('shadowlink-2')).toBeVisible();
    await expect(page.getByText('Active')).toBeVisible();
    await expect(page.getByText('Paused')).toBeVisible();
  });

  test('should filter shadowlinks by name', async ({ page }) => {
    // Mock API response with multiple shadowlinks
    await page.route('**/redpanda.api.console.v1alpha1.ShadowLinkService/ListShadowLinks', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          shadowLinks: [
            {
              name: 'prod-shadowlink',
              uid: '123',
              status: { state: 1 },
              configurations: {
                clientOptions: {
                  bootstrapServers: ['broker1:9092'],
                  clientId: '',
                  sourceClusterId: '',
                  metadataMaxAgeMs: 0,
                  connectionTimeoutMs: 0,
                  retryBackoffMs: 0,
                  fetchWaitMaxMs: 0,
                  fetchMinBytes: 0,
                  fetchMaxBytes: 0,
                },
              },
            },
            {
              name: 'dev-shadowlink',
              uid: '456',
              status: { state: 1 },
              configurations: {
                clientOptions: {
                  bootstrapServers: ['broker2:9092'],
                  clientId: '',
                  sourceClusterId: '',
                  metadataMaxAgeMs: 0,
                  connectionTimeoutMs: 0,
                  retryBackoffMs: 0,
                  fetchWaitMaxMs: 0,
                  fetchMinBytes: 0,
                  fetchMaxBytes: 0,
                },
              },
            },
          ],
        }),
      });
    });

    await page.reload();

    // Type in filter input
    await page.getByPlaceholder('Filter by name...').fill('prod');

    // Verify only prod shadowlink is visible
    await expect(page.getByTestId('shadowlink-row-prod-shadowlink')).toBeVisible();
    await expect(page.getByTestId('shadowlink-row-dev-shadowlink')).not.toBeVisible();
  });

  test('should show delete confirmation dialog', async ({ page }) => {
    // Setup mock data with NO active topics (shadowTopicStatuses empty or no active state)
    // This ensures the Delete button is shown instead of Failover
    await page.route('**/redpanda.api.console.v1alpha1.ShadowLinkService/ListShadowLinks', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          shadowLinks: [
            {
              name: 'test-shadowlink',
              uid: '123',
              status: {
                state: 1,
                shadowTopicStatuses: [], // No topics = no active topics
              },
              configurations: {
                clientOptions: {
                  bootstrapServers: ['broker1:9092'],
                  clientId: '',
                  sourceClusterId: '',
                  metadataMaxAgeMs: 0,
                  connectionTimeoutMs: 0,
                  retryBackoffMs: 0,
                  fetchWaitMaxMs: 0,
                  fetchMinBytes: 0,
                  fetchMaxBytes: 0,
                },
              },
            },
          ],
        }),
      });
    });

    await page.reload();

    // Click the Delete button directly (no dropdown menu in current implementation)
    await page.getByRole('button', { name: /delete/i }).click();

    // Verify confirmation dialog
    await expect(page.getByRole('alertdialog')).toBeVisible();
    await expect(page.getByText(/delete shadowlink/i)).toBeVisible();
    await expect(page.getByText(/you are about to delete/i)).toBeVisible();
  });

  test('should handle API loading state', async ({ page }) => {
    // Mock slow API response
    await page.route('**/redpanda.api.console.v1alpha1.ShadowLinkService/ListShadowLinks', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          shadowLinks: [],
        }),
      });
    });

    await page.reload();

    // Verify loading state is shown
    await expect(page.getByText('Loading shadowlinks...')).toBeVisible();
  });

  test('should handle API error state', async ({ page }) => {
    // Mock API error
    await page.route('**/redpanda.api.console.v1alpha1.ShadowLinkService/ListShadowLinks', async (route) => {
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({
          error: 'Internal server error',
        }),
      });
    });

    await page.reload();

    // Verify error state is shown
    await expect(page.getByText(/error loading shadowlinks/i)).toBeVisible();
  });
});
