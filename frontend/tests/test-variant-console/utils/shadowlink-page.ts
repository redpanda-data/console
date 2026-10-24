/** biome-ignore-all lint/performance/useTopLevelRegex: e2e test */
import type { Locator, Page } from '../../shared/e2e';
import { expect, retryAssertion } from '../../shared/e2e';

/**
 * Helper to generate unique shadowlink names
 */
export function generateShadowlinkName() {
  return `e2e-shadowlink-${crypto.randomUUID().slice(0, 13)}`;
}

type TopicFilter = {
  type: 'PREFIX' | 'LITERAL';
  filter: 'INCLUDE' | 'EXCLUDE';
  pattern: string;
};

/** Value of the create wizard's topic filter tab for each filter and pattern type. */
const TOPIC_FILTER_TAB_VALUES: Record<TopicFilter['filter'], Record<TopicFilter['type'], string>> = {
  INCLUDE: { LITERAL: 'include-specific', PREFIX: 'include-prefix' },
  EXCLUDE: { LITERAL: 'exclude-specific', PREFIX: 'exclude-prefix' },
};

/** Label of the edit page's topic filter tab for each filter and pattern type. */
const TOPIC_FILTER_TAB_LABELS: Record<TopicFilter['filter'], Record<TopicFilter['type'], string>> = {
  INCLUDE: { LITERAL: 'Include specific topics', PREFIX: 'Include starting with' },
  EXCLUDE: { LITERAL: 'Exclude specific', PREFIX: 'Exclude starting with' },
};

// Runs in the browser: whether the button holds the collapsible's chevron icon.
const isChevronButton = (button: Element) => {
  const svg = button.querySelector('svg');
  if (!svg) {
    return false;
  }
  // ChevronDown has specific classes h-4 w-4 transition-transform
  const classes = Array.from(svg.classList);
  return (
    classes.includes('lucide-chevron-down') ||
    (classes.includes('h-4') && classes.includes('w-4') && classes.includes('transition-transform'))
  );
};

// Checks the buttons recursively in DOM order and stops at the first chevron button.
const findFirstChevronButton = async ([btn, ...remainingButtons]: Locator[]): Promise<Locator | undefined> => {
  if (!btn) {
    return;
  }
  if (await btn.evaluate(isChevronButton)) {
    return btn;
  }
  return findFirstChevronButton(remainingButtons);
};

// Runs in the browser: whether the button holds a trash icon.
const isTrashButton = (button: Element) => button.querySelector('svg')?.classList.contains('lucide-trash');

/** The name input of every editable topic filter card, one per filter. */
const TOPIC_FILTER_NAME_INPUTS = '[data-testid^="topic-filter-"][data-testid$="-name"]';

// Dataplane ShadowLinkService RPCs the details page calls.
const FAILOVER_RPC_URL = /\/redpanda\.api\.dataplane\.v1\.ShadowLinkService\/FailOver/;
const LIST_SHADOW_TOPICS_RPC_URL = /\/redpanda\.api\.dataplane\.v1\.ShadowLinkService\/ListShadowLinkTopics/;

type ExecAsync = (command: string) => Promise<{ stdout: string }>;

const DESTINATION_SASL_FLAGS = '--user e2euser --password very-secret --sasl-mechanism SCRAM-SHA-256';

const createExecAsync = async (): Promise<ExecAsync> => {
  const { exec } = await import('node:child_process');
  const { promisify } = await import('node:util');
  return promisify(exec);
};

// Try both console-enterprise and enterprise naming conventions
const getStateFileCandidates = async () => {
  const { dirname, resolve } = await import('node:path');
  const { fileURLToPath } = await import('node:url');
  // ESM-safe __dirname equivalent (frontend/package.json sets "type": "module").
  const testsDir = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
  return [
    resolve(testsDir, '.testcontainers-state-console-enterprise.json'),
    resolve(testsDir, '.testcontainers-state-enterprise.json'),
  ];
};

const readDestinationContainerId = (
  readFileSync: (path: string, encoding: 'utf-8') => string,
  stateFilePath: string
) => {
  try {
    const state = JSON.parse(readFileSync(stateFilePath, 'utf-8'));
    return state.destRedpandaId as string | undefined;
  } catch {
    // Try next file
  }
};

/** Reads the destination container ID from the testcontainers state file. */
const findContainerIdInStateFiles = async () => {
  const { readFileSync, existsSync } = await import('node:fs');
  for (const stateFilePath of await getStateFileCandidates()) {
    const containerId = existsSync(stateFilePath) ? readDestinationContainerId(readFileSync, stateFilePath) : undefined;
    if (containerId) {
      console.log(`  Found container ID in ${stateFilePath}`);
      return containerId;
    }
  }
};

// Fallback: try to find container by exposed port (19193 for console-enterprise, 19093 for console).
// Ports are tried recursively in that order and the search stops at the first match, so console-enterprise wins.
const findContainerIdByPort = async (
  execAsync: ExecAsync,
  [port, ...remainingPorts]: string[] = ['19193', '19093']
): Promise<string | undefined> => {
  if (port === undefined) {
    return;
  }
  const { stdout: containerByPort } = await execAsync(`docker ps -q --filter "publish=${port}"`);
  const containerId = containerByPort.trim();
  if (containerId) {
    console.log(`  Found container by port ${port}`);
    return containerId;
  }
  return findContainerIdByPort(execAsync, remainingPorts);
};

const findDestinationContainerId = async (execAsync: ExecAsync) => {
  const containerId = await findContainerIdInStateFiles();
  if (containerId) {
    return containerId;
  }
  console.log('  Could not read state file, trying to find container by port...');
  return findContainerIdByPort(execAsync);
};

// Owlshop topics are the ones replicated by the shadowlink.
const parseReplicatedTopics = (topicListOutput: string) =>
  topicListOutput
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith('owlshop-') && !line.includes('PARTITIONS'));

/** Deletes the replicated topics from the destination cluster, authenticating with SASL. */
const deleteReplicatedTopics = async (execAsync: ExecAsync, containerId: string) => {
  const { stdout } = await execAsync(
    `docker exec ${containerId} rpk topic list --brokers localhost:9092 ${DESTINATION_SASL_FLAGS}`
  );
  const topics = parseReplicatedTopics(stdout);
  if (topics.length === 0) {
    console.log('  No topics to clean up');
    return;
  }
  console.log(`  Found ${topics.length} topics to delete: ${topics.join(', ')}`);
  // Chained one `docker exec` at a time so container load stays bounded however many topics were replicated.
  await topics.reduce<Promise<unknown>>(
    (previousDelete, topic) =>
      previousDelete.then(async () => {
        await execAsync(
          `docker exec ${containerId} rpk topic delete ${topic} --brokers localhost:9092 ${DESTINATION_SASL_FLAGS}`
        );
        console.log(`  ✓ Deleted topic: ${topic}`);
      }),
    Promise.resolve()
  );
  console.log('✓ Cleanup complete');
};

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
    await this.page.getByLabel(/shadow link name/i).fill(params.name);

    // Fill bootstrap servers using testId (first input field)
    await this.page.getByTestId('bootstrap-server-input-0').fill(params.bootstrapServers);

    // Ensure TLS is turned OFF
    await this.setToggle('tls-toggle', false);

    // Configure SASL if provided.
    if (params.username && params.password) {
      await this.fillScramCredentials(params.username, params.password, params.mechanism);
    }

    // Click Next button in stepper
    await this.page.getByRole('button', { name: /next/i }).click();
  }

  /** Clicks the toggle when its state differs from `checked`. */
  private async setToggle(testId: string, checked: boolean) {
    const toggle = this.page.getByTestId(testId);
    if ((await toggle.isChecked()) !== checked) {
      await toggle.click();
    }
  }

  /** Like `setToggle`, leaving the toggle alone when `checked` is not given. */
  private async setOptionalToggle(testId: string, checked: boolean | undefined) {
    if (checked !== undefined) {
      await this.setToggle(testId, checked);
    }
  }

  // The authentication picker is a 3-way Tabs (None / SCRAM / PLAIN); SCRAM is the default.
  // Click the tab explicitly to guarantee state even if the default ever changes.
  private async fillScramCredentials(
    username: string,
    password: string,
    mechanism?: 'SCRAM-SHA-256' | 'SCRAM-SHA-512'
  ) {
    await this.page.getByTestId('auth-method-scram').click();
    // Wait for SCRAM credential fields to render
    await this.page.getByTestId('scram-username-input').waitFor({ state: 'visible', timeout: 5000 });

    await this.page.getByLabel(/username/i).fill(username);

    // Use testid: the "Show password" toggle's aria-label also matches /password/i.
    await this.page.getByTestId('scram-password-input').fill(password);

    if (mechanism) {
      // Find mechanism combobox and click it
      await this.page.getByLabel(/mechanism/i).click();

      // Wait for dropdown to open and select the option
      await this.page.getByRole('option', { name: mechanism }).click();
    }
  }

  /**
   * Create wizard - Step 2: Configuration
   */
  async fillConfigurationStep(params: {
    topicFilters?: TopicFilter[];
    syncInterval?: number;
    consumerOffsets?: boolean;
    aclSync?: boolean;
    schemaRegistry?: boolean;
  }) {
    // Configure topic filters
    if (params.topicFilters && params.topicFilters.length > 0) {
      await this.fillTopicFilters(params.topicFilters);
    }

    // Configure sync interval
    if (params.syncInterval) {
      await this.page.getByTestId('shadowlink-sync-interval-input').fill(params.syncInterval.toString());
    }

    await this.setOptionalToggle('shadowlink-consumer-offsets-toggle', params.consumerOffsets);
    await this.setOptionalToggle('shadowlink-acl-sync-toggle', params.aclSync);
    await this.setOptionalToggle('shadowlink-schema-registry-toggle', params.schemaRegistry);

    // Click Create button
    await this.page.getByRole('button', { name: /create/i }).click();
  }

  private async fillTopicFilters(topicFilters: TopicFilter[]) {
    // Click "Specify topics" tab
    await this.page.getByTestId('topics-specify-tab').click();

    // Wait for filters container to be visible
    await this.page.getByTestId('topics-filters-container').waitFor({ state: 'visible' });

    // Chained in order: filter card `i` exists only after the previous cards were added
    await topicFilters.reduce<Promise<unknown>>(
      (previousFilter, filter, i) => previousFilter.then(() => this.fillTopicFilter(filter, i)),
      Promise.resolve()
    );
  }

  private async fillTopicFilter(filter: TopicFilter, i: number) {
    if (i > 0) {
      // Add new filter
      await this.page.getByTestId('add-topic-filter-button').click();
    }

    // Click the tab trigger for the filter and pattern type
    await this.page.getByTestId(`topic-filter-${i}-${TOPIC_FILTER_TAB_VALUES[filter.filter][filter.type]}`).click();

    // Fill in the pattern
    await this.page.getByTestId(`topic-filter-${i}-name`).fill(filter.pattern);
  }

  /**
   * Complete create flow
   */
  async createShadowlink(params: {
    name: string;
    bootstrapServers: string;
    username?: string;
    password?: string;
    topicFilters?: TopicFilter[];
  }) {
    await this.gotoCreate();
    await this.fillConnectionStep(params);
    await this.fillConfigurationStep({ topicFilters: params.topicFilters });

    // Wait for navigation to list page (frontend redirects to /shadowlinks after create)
    await this.page.waitForURL(/\/shadowlinks$/, { timeout: 60_000 });
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

  async verifyOnHomePage(_shadowlinkName: string, timeout = 30_000) {
    // Navigate to home page (root after login)
    await this.page.goto(this.shadowBackendURL);

    // Wait for home page to load - look for common elements
    await expect(this.page.getByRole('heading', { name: /overview|dashboard|home/i })).toBeVisible({ timeout: 10_000 });

    // Verify shadowlink section appears with retry logic
    // The Shadow Cluster section may take time to appear after shadowlink creation
    await retryAssertion(
      async () => {
        await this.page.reload({ waitUntil: 'domcontentloaded', timeout: 5000 });

        // Verify "Shadow Cluster" heading exists
        const shadowClusterHeading = this.page.getByRole('heading', { name: /shadow cluster/i });
        await expect(shadowClusterHeading).toBeVisible();

        // Verify the "Go to Shadow link" button exists
        const goToShadowLinkButton = this.page.getByRole('button', { name: /go to shadow link/i });
        await expect(goToShadowLinkButton).toBeVisible();
      },
      { timeout, intervals: [2000, 3000] }
    );
  }

  async verifyStatus(expectedStatus: 'ACTIVE' | 'PAUSED' | 'FAILED_OVER', timeout = 30_000) {
    await retryAssertion(
      async () => {
        await this.page.reload({ waitUntil: 'domcontentloaded', timeout: 5000 });
        const statusBadge = this.page.getByTestId('shadowlink-status-badge');
        await expect(statusBadge).toContainText(expectedStatus);
      },
      { timeout, intervals: [2000, 3000] }
    );
  }

  async verifyTopicCount(expectedCount: number, timeout = 30_000) {
    // Wait for topics to sync
    await retryAssertion(
      async () => {
        const topicCountElement = this.page.getByTestId('shadowlink-topic-count');
        const text = await topicCountElement.textContent();
        const count = Number.parseInt(text || '0', 10);
        expect(count).toBe(expectedCount);
      },
      { timeout }
    );
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
    await retryAssertion(
      async () => {
        await this.refreshReplicatedMetrics();

        // Check the values
        await this.expectMetricValue('metric-value-replicated', expectedMetrics.totalTopics);
        await this.expectMetricValue('metric-value-failedover', expectedMetrics.failedOverTopics);
        await this.expectMetricValue('metric-value-error', expectedMetrics.errorTopics);
      },
      { timeout, intervals: [3000] }
    );
  }

  // Try to click refresh button on replicated topics card to trigger refetch
  private async refreshReplicatedMetrics() {
    const replicatedCard = this.page.getByTestId('shadow-link-metric-replicated');
    await replicatedCard.hover({ timeout: 500 });
    const refreshBtn = replicatedCard.locator('button:has(svg.lucide-refresh-cw)');
    await refreshBtn.click({ force: true, timeout: 500 });
  }

  /** Expects the metric to show `expected`; no check when it isn't given. */
  private async expectMetricValue(testId: string, expected: number | undefined) {
    if (expected === undefined) {
      return;
    }
    const actualValue = await this.page.getByTestId(testId).textContent();
    expect(actualValue).toBe(expected.toString());
  }

  /**
   * Edit methods
   */
  async updateTopicFilters(filters: TopicFilter[]) {
    await this.expandShadowTopicsSection();
    await this.openSpecifyTopicsTab();

    // Clear existing filters - look for delete/trash buttons in elevated cards
    await this.clearTopicFilters();

    // Add new filters
    // After deleting all filters, we need to add new ones by clicking "Add filter" for each,
    // chained in order because each filter fills the card its own click just added
    await filters.reduce<Promise<unknown>>(
      (previousFilter, filter, filterIndex) => previousFilter.then(() => this.addTopicFilter(filter, filterIndex)),
      Promise.resolve()
    );

    await this.fillSourcePasswordForSave();

    // Save changes
    await this.page.getByRole('button', { name: /save/i }).click();

    // Wait for redirect back to details page (the save is successful if we're redirected)
    // The URL should change from /shadowlinks/{name}/edit to /shadowlinks/{name}
    await expect(this.page).toHaveURL(/\/shadowlinks\/[^/]+$/, {
      timeout: 10_000,
    });
  }

  private async expandShadowTopicsSection() {
    // Navigate to Shadowing tab
    await this.page.getByRole('tab', { name: /shadowing/i }).click();

    // Wait for the tab content to load: the "Shadow topics" section
    await this.page.getByRole('heading', { name: /shadow topics/i }).waitFor({ state: 'visible' });

    // ALWAYS try to expand the collapsible by clicking the chevron button
    // The issue is that tabs might be visible in resume view but we need the full editable view
    // The chevron button is right after the "Shadow topics" heading in the card header
    const chevronButton = await this.findChevronButton();
    if (!chevronButton) {
      throw new Error('Could not find chevron button to expand Shadow topics section');
    }
    await chevronButton.click();
    await expect(this.page.getByTestId('topics-toggle-button')).toHaveAttribute('aria-expanded', 'true');
  }

  // Simple approach: find all buttons with SVG, filter for the one that's actually a chevron icon
  private async findChevronButton() {
    return findFirstChevronButton(await this.page.getByRole('button').all());
  }

  private async openSpecifyTopicsTab() {
    // Now click the "Specify topics" tab
    const specifyTab = this.page.getByRole('tab', { name: /specify topics/i });
    await specifyTab.waitFor({ state: 'visible', timeout: 5000 });
    await specifyTab.click();

    // Wait for filter items to be visible: the editable list renders only while the section is expanded
    await expect(this.page.getByTestId('topics-filters-container')).toBeVisible();
  }

  // Keep finding and clicking trash buttons until none remain; each click re-renders the list,
  // so the next search starts only after the previous removal
  private async clearTopicFilters(): Promise<void> {
    if (await this.clickFirstTrashButton()) {
      await this.clearTopicFilters();
    }
  }

  /** Clicks the first trash button on the page; resolves to whether there was one. */
  private async clickFirstTrashButton() {
    const topicFilters = this.page.locator(TOPIC_FILTER_NAME_INPUTS);
    const filterCount = await topicFilters.count();
    const clicked = await this.clickFirstTrashButtonOf(await this.page.getByRole('button').all());
    if (clicked) {
      // On the Shadowing tab every trash button deletes one topic filter card
      await expect(topicFilters).toHaveCount(filterCount - 1);
    }
    return clicked;
  }

  // Checks the buttons recursively in DOM order and stops at the first trash button it clicks.
  private async clickFirstTrashButtonOf([btn, ...remainingButtons]: Locator[]): Promise<boolean> {
    if (!btn) {
      return false;
    }
    try {
      if (await btn.evaluate(isTrashButton)) {
        await btn.click();
        return true; // Re-query buttons on the next call
      }
    } catch {
      // Button may have been removed from DOM, continue to next
    }
    return this.clickFirstTrashButtonOf(remainingButtons);
  }

  private async addTopicFilter(filter: TopicFilter, filterIndex: number) {
    // Click "Add filter" button to create a new filter card
    await this.page.getByRole('button', { name: /add filter/i }).click();
    await expect(this.page.getByTestId(`topic-filter-${filterIndex}`)).toBeVisible();

    await this.selectTopicFilterTab(filter, filterIndex);

    // Use testId to find the specific input field directly
    // The input has testId="topic-filter-{index}-name"
    const inputInCard = this.page.locator(`[data-testid="topic-filter-${filterIndex}-name"]`);
    await inputInCard.click();
    await inputInCard.fill(filter.pattern);
    await expect(inputInCard).toHaveValue(filter.pattern);
  }

  // Find all tabs with the filter's label and click the one for this filter (filterIndex)
  private async selectTopicFilterTab(filter: TopicFilter, filterIndex: number) {
    const targetTab = this.page
      .getByRole('tab', { name: TOPIC_FILTER_TAB_LABELS[filter.filter][filter.type] })
      .nth(filterIndex);
    await targetTab.waitFor({ state: 'visible', timeout: 5000 });
    await targetTab.click();
    await expect(targetTab).toHaveAttribute('aria-selected', 'true');
  }

  // TODO: this is a bug that needs resolving.
  // Before saving, we need to go to the Source tab and fill the password
  // The form requires SCRAM password even if we're only changing topic filters
  private async fillSourcePasswordForSave() {
    const sourceTab = this.page.getByRole('tab', { name: /source/i });
    await sourceTab.click();
    await expect(sourceTab).toHaveAttribute('aria-selected', 'true');

    // Fill in the password field (required by form validation)
    const passwordInput = this.page.getByRole('textbox', { name: /password/i });
    await passwordInput.click();
    await passwordInput.fill('very-secret');
    await expect(passwordInput).toHaveValue('very-secret');
  }

  /**
   * Actions
   */
  async performFailover() {
    // Find "Failover all topics" button specifically (not individual topic failover buttons)
    const failoverButton = this.page.getByRole('button', { name: /^failover all topics$/i });
    await failoverButton.click();

    // Confirm in dialog and wait for the failover request to complete. The confirm button closes
    // the dialog at once, so the response is the milestone; its listener is armed before the click.
    const confirmButton = this.page.getByRole('button', { name: /confirm|yes|failover/i }).last();
    await Promise.all([this.page.waitForResponse(FAILOVER_RPC_URL), confirmButton.click()]);
  }

  async failoverTopic(topicName: string) {
    // Find the topic row and click failover action (should be on Overview tab)
    const topicRow = this.page.getByRole('row').filter({ hasText: topicName });
    const failoverButton = topicRow.getByRole('button', { name: /failover/i });
    await failoverButton.click();

    // Confirm in dialog and wait for the failover request, so the refresh below sees its result
    const confirmButton = this.page.getByRole('button', { name: /confirm|yes|failover/i }).last();
    await Promise.all([this.page.waitForResponse(FAILOVER_RPC_URL), confirmButton.click()]);

    // Click the refresh button for the replicated topics table and wait for the refreshed list
    // (the response listener is armed before the click)
    const refreshButton = this.page.getByTestId('refresh-topics-button');
    await Promise.all([this.page.waitForResponse(LIST_SHADOW_TOPICS_RPC_URL), refreshButton.click()]);

    // Verify the replication state changed to "Failed over"
    const topicRowAfterRefresh = this.page.getByRole('row').filter({ hasText: topicName });
    await expect(topicRowAfterRefresh.getByText(/failed over/i)).toBeVisible({ timeout: 5000 });
  }

  async deleteShadowlink() {
    // Find delete button by role and name
    const deleteButton = this.page.getByRole('button', { name: /delete/i });
    await deleteButton.click();

    // Wait for dialog to appear
    await expect(this.page.getByRole('alertdialog', { name: 'Delete Shadowlink' })).toBeVisible();

    // Type "delete" in the confirmation textbox
    const confirmInput = this.page.getByRole('textbox', { name: /type.*delete|confirm/i });
    await confirmInput.fill('delete');

    // Wait for the delete button to become enabled
    const confirmButton = this.page.getByRole('button', { name: /delete/i }).last();
    await expect(confirmButton).toBeEnabled();

    // Click final confirm button in the dialog
    await confirmButton.click();

    // Wait for redirect to list
    await expect(this.page).toHaveURL(`${this.shadowBackendURL}/shadowlinks`, { timeout: 15_000 });

    // Clean up replicated topics in destination cluster
    await this.cleanupDestinationTopics();
  }

  async cleanupDestinationTopics() {
    console.log('Cleaning up replicated topics in destination cluster...');
    try {
      const execAsync = await createExecAsync();
      const containerId = await findDestinationContainerId(execAsync);
      if (!containerId) {
        console.log('  No destination cluster container found, skipping cleanup');
        return;
      }
      await deleteReplicatedTopics(execAsync, containerId.trim());
    } catch (error) {
      console.log(
        `  Warning: Could not clean up destination topics: ${error instanceof Error ? error.message : String(error)}`
      );
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
