/** biome-ignore-all lint/performance/useTopLevelRegex: e2e test */
import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';

/**
 * Helper to generate unique shadowlink names
 */
export function generateShadowlinkName() {
  const timestamp = Date.now().toString().slice(-8);
  const random = Math.random().toString(36).substring(2, 6);
  return `e2e-shadowlink-${timestamp}-${random}`;
}

/**
 * Page Object Model for Shadow Link pages
 * Handles shadowlink list, create, edit, details, and verification
 *
 * Shadowlinks are created on the DESTINATION cluster console
 * to pull data FROM the source cluster.
 * Uses shadowBackendURL from Playwright config if available.
 */
export class ShadowlinkPage {
  readonly page: Page;
  readonly shadowBackendURL: string;

  constructor(page: Page, shadowBackendURL?: string) {
    this.page = page;
    // shadowBackendURL should be passed from the test using the fixture
    // Falls back to 3001 if not provided
    this.shadowBackendURL = shadowBackendURL ?? 'http://localhost:3001';
  }

  /**
   * Navigation methods
   */
  async goto() {
    await this.page.goto(`${this.shadowBackendURL}/shadowlinks`);
    await expect(this.page.getByRole('heading', { name: /shadow links/i })).toBeVisible({ timeout: 10_000 });
  }

  async gotoCreate() {
    await this.page.goto(`${this.shadowBackendURL}/shadowlinks/create`);
    await expect(this.page.getByRole('heading', { name: /create shadow link/i })).toBeVisible({ timeout: 10_000 });
  }

  async gotoDetails(name: string) {
    await this.page.goto(`${this.shadowBackendURL}/shadowlinks/${encodeURIComponent(name)}`);
    await expect(this.page.getByRole('heading', { name })).toBeVisible({
      timeout: 10_000,
    });
  }

  async gotoEdit(name: string) {
    await this.page.goto(`${this.shadowBackendURL}/shadowlinks/${encodeURIComponent(name)}/edit`);
    await expect(this.page.getByRole('heading', { name: /edit shadow link/i })).toBeVisible({ timeout: 10_000 });
  }

  /**
   * Create wizard - Step 1: Connection
   */
  async fillConnectionStep(params: {
    name: string;
    bootstrapServers: string;
    username?: string;
    password?: string;
    mechanism?: 'SCRAM-SHA-256' | 'SCRAM-SHA-512';
  }) {
    // Fill name using label
    const nameInput = this.page.getByLabel(/shadow link name/i);
    await nameInput.fill(params.name);

    // Fill bootstrap servers using testId (first input field)
    const bootstrapInput = this.page.getByTestId('bootstrap-server-input-0');
    await bootstrapInput.fill(params.bootstrapServers);

    // Ensure TLS is turned OFF
    const tlsToggle = this.page.getByTestId('tls-toggle');
    const isTlsChecked = await tlsToggle.isChecked();
    if (isTlsChecked) {
      await tlsToggle.click();
    }

    // Configure SASL if provided
    if (params.username && params.password) {
      // Find and toggle SCRAM switch - look for the switch near "SCRAM" text
      const scramSection = this.page.getByText('SCRAM').locator('..');
      const scramToggle = scramSection.getByRole('switch');

      // Check if SCRAM is already enabled
      const isScramEnabled = await scramToggle.isChecked();
      if (!isScramEnabled) {
        await scramToggle.click();
        // Wait for username field to appear after toggle
        await this.page.getByLabel(/username/i).waitFor({ state: 'visible', timeout: 5000 });
      }

      // Fill username and password using labels
      const usernameInput = this.page.getByLabel(/username/i);
      await usernameInput.fill(params.username);

      const passwordInput = this.page.getByLabel(/password/i);
      await passwordInput.fill(params.password);

      if (params.mechanism) {
        // Find mechanism combobox and click it
        const mechanismButton = this.page.getByLabel(/mechanism/i);
        await mechanismButton.click();

        // Wait for dropdown to open and select the option
        await this.page.getByRole('option', { name: params.mechanism }).click();
      }
    }

    // Click Next button in stepper
    const nextButton = this.page.getByRole('button', { name: /next/i });
    await nextButton.click();
  }

  /**
   * Create wizard - Step 2: Configuration
   */
  async fillConfigurationStep(params: {
    topicFilters?: Array<{
      type: 'PREFIX' | 'LITERAL';
      filter: 'INCLUDE' | 'EXCLUDE';
      pattern: string;
    }>;
    syncInterval?: number;
    consumerOffsets?: boolean;
    aclSync?: boolean;
    schemaRegistry?: boolean;
  }) {
    // Configure topic filters
    if (params.topicFilters && params.topicFilters.length > 0) {
      // Click "Specify topics" tab
      const specifyTopicsTab = this.page.getByTestId('topics-specify-tab');
      await specifyTopicsTab.click();

      // Wait for filters container to be visible
      await this.page.getByTestId('topics-filters-container').waitFor({ state: 'visible' });

      for (let i = 0; i < params.topicFilters.length; i++) {
        const filter = params.topicFilters[i];

        if (i > 0) {
          // Add new filter
          const addFilterBtn = this.page.getByTestId('add-topic-filter-button');
          await addFilterBtn.click();
        }

        // Determine the tab value based on filter type and pattern type
        let tabValue = 'include-specific'; // default
        if (filter.type === 'LITERAL' && filter.filter === 'INCLUDE') {
          tabValue = 'include-specific';
        } else if (filter.type === 'PREFIX' && filter.filter === 'INCLUDE') {
          tabValue = 'include-prefix';
        } else if (filter.type === 'LITERAL' && filter.filter === 'EXCLUDE') {
          tabValue = 'exclude-specific';
        } else if (filter.type === 'PREFIX' && filter.filter === 'EXCLUDE') {
          tabValue = 'exclude-prefix';
        }

        // Click the appropriate tab trigger
        const tabTrigger = this.page.getByTestId(`topic-filter-${i}-${tabValue}`);
        await tabTrigger.click();

        // Fill in the pattern
        const patternInput = this.page.getByTestId(`topic-filter-${i}-name`);
        await patternInput.fill(filter.pattern);
      }
    }

    // Configure sync interval
    if (params.syncInterval) {
      const intervalInput = this.page.getByTestId('shadowlink-sync-interval-input');
      await intervalInput.fill(params.syncInterval.toString());
    }

    // Toggle consumer offsets
    if (params.consumerOffsets !== undefined) {
      const toggle = this.page.getByTestId('shadowlink-consumer-offsets-toggle');
      const isChecked = await toggle.isChecked();
      if (isChecked !== params.consumerOffsets) {
        await toggle.click();
      }
    }

    // Toggle ACL sync
    if (params.aclSync !== undefined) {
      const toggle = this.page.getByTestId('shadowlink-acl-sync-toggle');
      const isChecked = await toggle.isChecked();
      if (isChecked !== params.aclSync) {
        await toggle.click();
      }
    }

    // Toggle schema registry sync
    if (params.schemaRegistry !== undefined) {
      const toggle = this.page.getByTestId('shadowlink-schema-registry-toggle');
      const isChecked = await toggle.isChecked();
      if (isChecked !== params.schemaRegistry) {
        await toggle.click();
      }
    }

    // Click Create button
    const createButton = this.page.getByRole('button', { name: /create/i });
    await createButton.click();
  }

  /**
   * Complete create flow
   */
  async createShadowlink(params: {
    name: string;
    bootstrapServers: string;
    username?: string;
    password?: string;
    topicFilters?: Array<{
      type: 'PREFIX' | 'LITERAL';
      filter: 'INCLUDE' | 'EXCLUDE';
      pattern: string;
    }>;
  }) {
    await this.gotoCreate();
    await this.fillConnectionStep(params);
    await this.fillConfigurationStep({ topicFilters: params.topicFilters });

    // Wait for navigation to details page
    // CI is slower, so wait for the URL to change from /create to the details page
    await this.page.waitForURL(/\/shadowlinks\/(?!create)[^/]+$/, { timeout: 60_000 });
  }

  /**
   * Details page - Verification methods
   */
  async verifyInList(name: string) {
    await this.goto();
    const linkElement = this.page.getByRole('link', { name, exact: true });
    await expect(linkElement).toBeVisible({ timeout: 10_000 });
  }

  async verifyNotInList(name: string) {
    await this.goto();
    const linkElement = this.page.getByRole('link', { name, exact: true });
    await expect(linkElement).not.toBeVisible();
  }

  async verifyOnHomePage(shadowlinkName: string, timeout = 30_000) {
    // Navigate to home page (root after login)
    await this.page.goto(this.shadowBackendURL);

    // Wait for home page to load - look for common elements
    await expect(this.page.getByRole('heading', { name: /overview|dashboard|home/i })).toBeVisible({ timeout: 10_000 });

    // Verify shadowlink section appears with retry logic
    // The Shadow Cluster section may take time to appear after shadowlink creation
    await expect(async () => {
      await this.page.reload({ waitUntil: 'domcontentloaded', timeout: 5000 });

      // Verify "Shadow Cluster" heading exists
      const shadowClusterHeading = this.page.getByRole('heading', { name: /shadow cluster/i });
      await expect(shadowClusterHeading).toBeVisible();

      // Verify the "Go to Shadow link" button exists
      const goToShadowLinkButton = this.page.getByRole('button', { name: /go to shadow link/i });
      await expect(goToShadowLinkButton).toBeVisible();
    }).toPass({ timeout, intervals: [2000, 3000] });
  }

  async verifyStatus(expectedStatus: 'ACTIVE' | 'PAUSED' | 'FAILED_OVER', timeout = 30_000) {
    await expect(async () => {
      await this.page.reload({ waitUntil: 'domcontentloaded', timeout: 5000 });
      const statusBadge = this.page.getByTestId('shadowlink-status-badge');
      await expect(statusBadge).toContainText(expectedStatus);
    }).toPass({ timeout, intervals: [2000, 3000] });
  }

  async verifyTopicCount(expectedCount: number, timeout = 30_000) {
    // Wait for topics to sync
    await expect(async () => {
      const topicCountElement = this.page.getByTestId('shadowlink-topic-count');
      const text = await topicCountElement.textContent();
      const count = Number.parseInt(text || '0', 10);
      expect(count).toBe(expectedCount);
    }).toPass({ timeout });
  }

  async verifyTopicExists(topicName: string) {
    // Look for the topic name in the topics table
    const topicElement = this.page.getByText(topicName, { exact: true });
    await expect(topicElement).toBeVisible({ timeout: 30_000 });
  }

  async verifyMetrics(
    expectedMetrics: {
      totalTopics?: number;
      failedOverTopics?: number;
      errorTopics?: number;
    },
    timeout = 90_000
  ) {
    // Poll metrics values with periodic refresh button clicks
    await expect(async () => {
      // Try to click refresh button on replicated topics card to trigger refetch
      const replicatedCard = this.page.getByTestId('shadow-link-metric-replicated');
      await replicatedCard.hover({ timeout: 500 });
      const refreshBtn = replicatedCard.locator('button:has(svg.lucide-refresh-cw)');
      await refreshBtn.click({ force: true, timeout: 500 });

      // Check the values
      if (expectedMetrics.totalTopics !== undefined) {
        const totalElement = this.page.getByTestId('metric-value-replicated');
        const actualValue = await totalElement.textContent();
        expect(actualValue).toBe(expectedMetrics.totalTopics.toString());
      }

      if (expectedMetrics.failedOverTopics !== undefined) {
        const failedOverElement = this.page.getByTestId('metric-value-failedover');
        const actualValue = await failedOverElement.textContent();
        expect(actualValue).toBe(expectedMetrics.failedOverTopics.toString());
      }

      if (expectedMetrics.errorTopics !== undefined) {
        const errorElement = this.page.getByTestId('metric-value-error');
        const actualValue = await errorElement.textContent();
        expect(actualValue).toBe(expectedMetrics.errorTopics.toString());
      }
    }).toPass({ timeout, intervals: [3000] });
  }

  /**
   * Edit methods
   */
  async updateTopicFilters(
    filters: Array<{
      type: 'PREFIX' | 'LITERAL';
      filter: 'INCLUDE' | 'EXCLUDE';
      pattern: string;
    }>
  ) {
    // Navigate to Shadowing tab
    const shadowingTab = this.page.getByRole('tab', { name: /shadowing/i });
    await shadowingTab.click();

    // Wait for the tab content to load
    await this.page.waitForTimeout(500);

    // Find the "Shadow topics" section
    const shadowTopicsHeading = this.page.getByRole('heading', { name: /shadow topics/i });
    await shadowTopicsHeading.waitFor({ state: 'visible' });

    // ALWAYS try to expand the collapsible by clicking the chevron button
    // The issue is that tabs might be visible in resume view but we need the full editable view
    // The chevron button is right after the "Shadow topics" heading in the card header
    // Simple approach: find all buttons with SVG, filter for the one that's actually a chevron icon
    const buttonsForChevron = await this.page.getByRole('button').all();

    let chevronClicked = false;
    for (const btn of buttonsForChevron) {
      // Check if this button contains an SVG with class matching chevron pattern
      const isChevron = await btn.evaluate((button) => {
        const svg = button.querySelector('svg');
        if (!svg) return false;
        // ChevronDown has specific classes h-4 w-4 transition-transform
        const classes = Array.from(svg.classList);
        return (
          classes.includes('lucide-chevron-down') ||
          (classes.includes('h-4') && classes.includes('w-4') && classes.includes('transition-transform'))
        );
      });

      if (isChevron) {
        await btn.click();
        await this.page.waitForTimeout(800);
        chevronClicked = true;
        break;
      }
    }

    if (!chevronClicked) {
      throw new Error('Could not find chevron button to expand Shadow topics section');
    }

    // Now click the "Specify topics" tab
    const specifyTab = this.page.getByRole('tab', { name: /specify topics/i });
    await specifyTab.waitFor({ state: 'visible', timeout: 5000 });
    await specifyTab.click();

    // Wait for filter items to be visible
    await this.page.waitForTimeout(1000);

    // Clear existing filters - look for delete/trash buttons in elevated cards
    // Keep finding and clicking trash buttons until none remain
    let foundTrashButton = true;
    while (foundTrashButton) {
      foundTrashButton = false;
      const allButtons = await this.page.getByRole('button').all();

      for (const btn of allButtons) {
        try {
          const isTrashButton = await btn.evaluate((button) => {
            const svg = button.querySelector('svg');
            return svg?.classList.contains('lucide-trash');
          });

          if (isTrashButton) {
            await btn.click();
            await this.page.waitForTimeout(300);
            foundTrashButton = true;
            break; // Exit inner loop and re-query buttons
          }
        } catch (e) {
          // Button may have been removed from DOM, continue to next
        }
      }
    }

    // Add new filters
    // After deleting all filters, we need to add new ones by clicking "Add filter" for each
    let filterIndex = 0;
    for (const filter of filters) {
      // Click "Add filter" button to create a new filter card
      const addBtn = this.page.getByRole('button', { name: /add filter/i });
      await addBtn.click();
      await this.page.waitForTimeout(800);

      // Determine the tab label based on filter type and pattern type
      let tabLabel = '';
      if (filter.type === 'LITERAL' && filter.filter === 'INCLUDE') {
        tabLabel = 'Include specific topics';
      } else if (filter.type === 'PREFIX' && filter.filter === 'INCLUDE') {
        tabLabel = 'Include starting with';
      } else if (filter.type === 'LITERAL' && filter.filter === 'EXCLUDE') {
        tabLabel = 'Exclude specific';
      } else if (filter.type === 'PREFIX' && filter.filter === 'EXCLUDE') {
        tabLabel = 'Exclude starting with';
      }

      // Find all tabs with this label and click the one for this filter (filterIndex)
      const allTabsWithLabel = this.page.getByRole('tab', { name: tabLabel });
      const targetTab = allTabsWithLabel.nth(filterIndex);
      await targetTab.waitFor({ state: 'visible', timeout: 5000 });
      await targetTab.click();
      await this.page.waitForTimeout(300);

      // Use testId to find the specific input field directly
      // The input has testId="topic-filter-{index}-name"
      const inputInCard = this.page.locator(`[data-testid="topic-filter-${filterIndex}-name"]`);
      await inputInCard.click();
      await inputInCard.fill(filter.pattern);
      await this.page.waitForTimeout(200);

      filterIndex++;
    }

    // TODO: this is a bug that needs resolving.
    // Before saving, we need to go to the Source tab and fill the password
    // The form requires SCRAM password even if we're only changing topic filters
    const sourceTab = this.page.getByRole('tab', { name: /source/i });
    await sourceTab.click();
    await this.page.waitForTimeout(500);

    // Fill in the password field (required by form validation)
    const passwordInput = this.page.getByRole('textbox', { name: /password/i });
    await passwordInput.click();
    await passwordInput.fill('very-secret');
    await this.page.waitForTimeout(200);

    // Save changes
    const saveButton = this.page.getByRole('button', { name: /save/i });
    await saveButton.click();

    // Wait for redirect back to details page (the save is successful if we're redirected)
    // The URL should change from /shadowlinks/{name}/edit to /shadowlinks/{name}
    await expect(this.page).toHaveURL(/\/shadowlinks\/[^/]+$/, {
      timeout: 10_000,
    });
  }

  /**
   * Actions
   */
  async performFailover() {
    // Find "Failover all topics" button specifically (not individual topic failover buttons)
    const failoverButton = this.page.getByRole('button', { name: /^failover all topics$/i });
    await failoverButton.click();

    // Confirm in dialog
    const confirmButton = this.page.getByRole('button', { name: /confirm|yes|failover/i }).last();
    await confirmButton.click();

    // Wait a moment for failover to initiate
    await this.page.waitForTimeout(1000);
  }

  async failoverTopic(topicName: string) {
    // Find the topic row and click failover action (should be on Overview tab)
    const topicRow = this.page.getByRole('row').filter({ hasText: topicName });
    const failoverButton = topicRow.getByRole('button', { name: /failover/i });
    await failoverButton.click();

    // Confirm in dialog
    const confirmButton = this.page.getByRole('button', { name: /confirm|yes|failover/i }).last();
    await confirmButton.click();

    // Wait a moment for failover to process
    // await this.page.waitForTimeout(1000);

    // Click the refresh button for the replicated topics table
    const refreshButton = this.page.getByTestId('refresh-topics-button');
    await refreshButton.click();
    await this.page.waitForTimeout(500); // Wait for refresh to complete

    // Verify the replication state changed to "Failed over"
    const topicRowAfterRefresh = this.page.getByRole('row').filter({ hasText: topicName });
    await expect(topicRowAfterRefresh.getByText(/failed over/i)).toBeVisible({ timeout: 5000 });
  }

  async deleteShadowlink() {
    // Find delete button by role and name
    const deleteButton = this.page.getByRole('button', { name: /delete/i });
    await deleteButton.click();

    // Wait for dialog to appear
    await this.page.waitForTimeout(500);

    // Type "delete" in the confirmation textbox
    const confirmInput = this.page.getByRole('textbox', { name: /type.*delete|confirm/i });
    await confirmInput.fill('delete');

    // Wait a moment for the delete button to become enabled
    await this.page.waitForTimeout(200);

    // Click final confirm button in the dialog
    const confirmButton = this.page.getByRole('button', { name: /delete/i }).last();
    await confirmButton.click();

    // Wait for redirect to list
    await expect(this.page).toHaveURL(`${this.shadowBackendURL}/shadowlinks`, { timeout: 15_000 });

    // Clean up replicated topics in destination cluster
    await this.cleanupDestinationTopics();
  }

  async cleanupDestinationTopics() {
    console.log('Cleaning up replicated topics in destination cluster...');
    try {
      const { exec } = await import('node:child_process');
      const { promisify } = await import('node:util');
      const { readFileSync, existsSync } = await import('node:fs');
      const { resolve } = await import('node:path');
      const execAsync = promisify(exec);

      // Read state file to get destination container ID
      // Try both console-enterprise and enterprise naming conventions
      const testsDir = resolve(__dirname, '../..');
      const possibleStateFiles = [
        resolve(testsDir, '.testcontainers-state-console-enterprise.json'),
        resolve(testsDir, '.testcontainers-state-enterprise.json'),
      ];

      let containerId: string | undefined;

      for (const stateFilePath of possibleStateFiles) {
        if (existsSync(stateFilePath)) {
          try {
            const stateContent = readFileSync(stateFilePath, 'utf-8');
            const state = JSON.parse(stateContent);
            containerId = state.destRedpandaId;
            if (containerId) {
              console.log(`  Found container ID in ${stateFilePath}`);
              break;
            }
          } catch {
            // Try next file
          }
        }
      }

      if (!containerId) {
        console.log('  Could not read state file, trying to find container by port...');
        // Fallback: try to find container by exposed port (19193 for console-enterprise, 19093 for console)
        for (const port of ['19193', '19093']) {
          const { stdout: containerByPort } = await execAsync(`docker ps -q --filter "publish=${port}"`);
          containerId = containerByPort.trim();
          if (containerId) {
            console.log(`  Found container by port ${port}`);
            break;
          }
        }
      }

      if (!containerId) {
        console.log('  No destination cluster container found, skipping cleanup');
        return;
      }

      // List all topics in destination cluster with SASL auth
      const saslFlags = '--user e2euser --password very-secret --sasl-mechanism SCRAM-SHA-256';
      const listCmd = `docker exec ${containerId.trim()} rpk topic list --brokers localhost:9092 ${saslFlags}`;
      const { stdout } = await execAsync(listCmd);

      // Filter owlshop topics (the ones replicated by shadowlink)
      const topics = stdout
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line.startsWith('owlshop-') && !line.includes('PARTITIONS'));

      if (topics.length === 0) {
        console.log('  No topics to clean up');
        return;
      }

      console.log(`  Found ${topics.length} topics to delete: ${topics.join(', ')}`);

      // Delete each topic with SASL auth
      for (const topic of topics) {
        const deleteCmd = `docker exec ${containerId.trim()} rpk topic delete ${topic} --brokers localhost:9092 ${saslFlags}`;
        await execAsync(deleteCmd);
        console.log(`  ✓ Deleted topic: ${topic}`);
      }

      console.log('✓ Cleanup complete');
    } catch (error) {
      console.log(`  Warning: Could not clean up destination topics: ${error.message}`);
    }
  }

  /**
   * Helper methods
   */
  async clickTab(tabName: 'Overview' | 'Tasks' | 'Configuration') {
    const tab = this.page.getByRole('tab', { name: new RegExp(tabName, 'i') });
    await tab.click();
    await expect(tab).toHaveAttribute('aria-selected', 'true');
  }
}
