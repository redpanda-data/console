/* biome-ignore-all lint/performance/useTopLevelRegex: e2e test */
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

const TOPIC_FILTER_TAB_VALUES: Record<TopicFilter['filter'], Record<TopicFilter['type'], string>> = {
  INCLUDE: { LITERAL: 'include-specific', PREFIX: 'include-prefix' },
  EXCLUDE: { LITERAL: 'exclude-specific', PREFIX: 'exclude-prefix' },
};

const TOPIC_FILTER_TAB_LABELS: Record<TopicFilter['filter'], Record<TopicFilter['type'], string>> = {
  INCLUDE: { LITERAL: 'Include specific topics', PREFIX: 'Include starting with' },
  EXCLUDE: { LITERAL: 'Exclude specific', PREFIX: 'Exclude starting with' },
};

const isChevronButton = (button: Element) => {
  const svg = button.querySelector('svg');
  if (!svg) {
    return false;
  }
  const classes = Array.from(svg.classList);
  return (
    classes.includes('lucide-chevron-down') ||
    (classes.includes('h-4') && classes.includes('w-4') && classes.includes('transition-transform'))
  );
};

const findFirstChevronButton = async ([btn, ...remainingButtons]: Locator[]) => {
  if (!btn) {
    return;
  }
  if (await btn.evaluate(isChevronButton)) {
    return btn;
  }
  return findFirstChevronButton(remainingButtons);
};

const isTrashButton = (button: Element) => button.querySelector('svg')?.classList.contains('lucide-trash');

const TOPIC_FILTER_NAME_INPUTS = '[data-testid^="topic-filter-"][data-testid$="-name"]';

const FAILOVER_RPC_URL = /\/redpanda\.api\.dataplane\.v1\.ShadowLinkService\/FailOver/u;
const LIST_SHADOW_TOPICS_RPC_URL = /\/redpanda\.api\.dataplane\.v1\.ShadowLinkService\/ListShadowLinkTopics/u;

type ExecAsync = (command: string) => Promise<{ stdout: string }>;

const DESTINATION_SASL_FLAGS = '--user e2euser --password very-secret --sasl-mechanism SCRAM-SHA-256';

const createExecAsync: () => Promise<ExecAsync> = async () => {
  const { exec } = await import('node:child_process');
  const { promisify } = await import('node:util');
  return promisify(exec);
};

const getStateFileCandidates = async () => {
  const { dirname, resolve } = await import('node:path');
  const { fileURLToPath } = await import('node:url');
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
    return null;
  }
};

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

// WARNING: Prefer the enterprise broker to the OSS broker when falling back to port lookup.
const findContainerIdByPort = async (
  execAsync: ExecAsync,
  [port, ...remainingPorts]: string[] = ['19193', '19093']
) => {
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

const parseReplicatedTopics = (topicListOutput: string) =>
  topicListOutput
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith('owlshop-') && !line.includes('PARTITIONS'));

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
  // WARNING: Delete replicated topics sequentially so a large topic list cannot exhaust container exec capacity.
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
 *
 * Supply the destination URL from the test fixture; port 3001 is only the local fallback. Link cleanup removes the OwlShop topics replicated to that destination.
 */
export class ShadowlinkPage {
  readonly page: Page;
  readonly shadowBackendURL: string;

  constructor(page: Page, shadowBackendURL?: string) {
    this.page = page;
    this.shadowBackendURL = shadowBackendURL ?? 'http://localhost:3001';
  }

  /**
   * Navigation methods
   */
  async goto() {
    await this.page.goto(`${this.shadowBackendURL}/shadowlinks`);
    await expect(this.page.getByRole('heading', { name: /shadow links/iu })).toBeVisible({ timeout: 10_000 });
  }

  async gotoCreate() {
    await this.page.goto(`${this.shadowBackendURL}/shadowlinks/create`);
    await expect(this.page.getByRole('heading', { name: /create shadow link/iu })).toBeVisible({ timeout: 10_000 });
  }

  async gotoDetails(name: string) {
    await this.page.goto(`${this.shadowBackendURL}/shadowlinks/${encodeURIComponent(name)}`);
    await expect(this.page.getByRole('heading', { name })).toBeVisible({
      timeout: 10_000,
    });
  }

  async gotoEdit(name: string) {
    await this.page.goto(`${this.shadowBackendURL}/shadowlinks/${encodeURIComponent(name)}/edit`);
    await expect(this.page.getByRole('heading', { name: /edit shadow link/iu })).toBeVisible({ timeout: 10_000 });
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
    await this.page.getByLabel(/shadow link name/iu).fill(params.name);

    await this.page.getByTestId('bootstrap-server-input-0').fill(params.bootstrapServers);

    await this.setToggle('tls-toggle', false);

    if (params.username && params.password) {
      await this.fillScramCredentials(params.username, params.password, params.mechanism);
    }

    await this.page.getByRole('button', { name: /next/iu }).click();
  }

  private async setToggle(testId: string, checked: boolean) {
    const toggle = this.page.getByTestId(testId);
    if ((await toggle.isChecked()) !== checked) {
      await toggle.click();
    }
  }

  private async setOptionalToggle(testId: string, checked: boolean | undefined) {
    if (checked !== undefined) {
      await this.setToggle(testId, checked);
    }
  }

  private async fillScramCredentials(
    username: string,
    password: string,
    mechanism?: 'SCRAM-SHA-256' | 'SCRAM-SHA-512'
  ) {
    await this.page.getByTestId('auth-method-scram').click();
    await this.page.getByTestId('scram-username-input').waitFor({ state: 'visible', timeout: 5000 });

    await this.page.getByLabel(/username/iu).fill(username);

    // WARNING: Use the password input's test ID; the reveal toggle also has a name containing password.
    await this.page.getByTestId('scram-password-input').fill(password);

    if (mechanism) {
      await this.page.getByLabel(/mechanism/iu).click();

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
    if (params.topicFilters && params.topicFilters.length > 0) {
      await this.fillTopicFilters(params.topicFilters);
    }

    if (params.syncInterval) {
      await this.page.getByTestId('shadowlink-sync-interval-input').fill(params.syncInterval.toString());
    }

    await this.setOptionalToggle('shadowlink-consumer-offsets-toggle', params.consumerOffsets);
    await this.setOptionalToggle('shadowlink-acl-sync-toggle', params.aclSync);
    await this.setOptionalToggle('shadowlink-schema-registry-toggle', params.schemaRegistry);

    await this.page.getByRole('button', { name: /create/iu }).click();
  }

  private async fillTopicFilters(topicFilters: TopicFilter[]) {
    await this.page.getByTestId('topics-specify-tab').click();

    await this.page.getByTestId('topics-filters-container').waitFor({ state: 'visible' });

    // WARNING: Add filters sequentially; each click creates the next card before the helper fills it.
    await topicFilters.reduce<Promise<unknown>>(
      (previousFilter, filter, i) => previousFilter.then(() => this.fillTopicFilter(filter, i)),
      Promise.resolve()
    );
  }

  private async fillTopicFilter(filter: TopicFilter, i: number) {
    if (i > 0) {
      await this.page.getByTestId('add-topic-filter-button').click();
    }

    await this.page.getByTestId(`topic-filter-${i}-${TOPIC_FILTER_TAB_VALUES[filter.filter][filter.type]}`).click();

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

    await this.page.waitForURL(/\/shadowlinks$/u, { timeout: 60_000 });
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
    await this.page.goto(this.shadowBackendURL);

    await expect(this.page.getByRole('heading', { name: /overview|dashboard|home/iu })).toBeVisible({
      timeout: 10_000,
    });

    await retryAssertion(
      async () => {
        await this.page.reload({ waitUntil: 'domcontentloaded', timeout: 5000 });

        const shadowClusterHeading = this.page.getByRole('heading', { name: /shadow cluster/iu });
        await expect(shadowClusterHeading).toBeVisible();

        const goToShadowLinkButton = this.page.getByRole('button', { name: /go to shadow link/iu });
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
    await retryAssertion(
      async () => {
        await this.refreshReplicatedMetrics();

        await this.expectMetricValue('metric-value-replicated', expectedMetrics.totalTopics);
        await this.expectMetricValue('metric-value-failedover', expectedMetrics.failedOverTopics);
        await this.expectMetricValue('metric-value-error', expectedMetrics.errorTopics);
      },
      { timeout, intervals: [3000] }
    );
  }

  private async refreshReplicatedMetrics() {
    const replicatedCard = this.page.getByTestId('shadow-link-metric-replicated');
    await replicatedCard.hover({ timeout: 500 });
    const refreshBtn = replicatedCard.locator('button:has(svg.lucide-refresh-cw)');
    await refreshBtn.click({ force: true, timeout: 500 });
  }

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

    await this.clearTopicFilters();

    // WARNING: Wait for each filter card to exist before adding the next one; list indexes change as cards mount.
    await filters.reduce<Promise<unknown>>(
      (previousFilter, filter, filterIndex) => previousFilter.then(() => this.addTopicFilter(filter, filterIndex)),
      Promise.resolve()
    );

    await this.fillSourcePasswordForSave();

    await this.page.getByRole('button', { name: /save/iu }).click();

    await expect(this.page).toHaveURL(/\/shadowlinks\/[^/]+$/u, {
      timeout: 10_000,
    });
  }

  private async expandShadowTopicsSection() {
    await this.page.getByRole('tab', { name: /shadowing/iu }).click();

    await this.page.getByRole('heading', { name: /shadow topics/iu }).waitFor({ state: 'visible' });

    // WARNING: Open the editor before using filter tabs; a collapsed summary can also expose a tab label.
    const chevronButton = await this.findChevronButton();
    if (!chevronButton) {
      throw new Error('Could not find chevron button to expand Shadow topics section');
    }
    await chevronButton.click();
    await expect(this.page.getByTestId('topics-toggle-button')).toHaveAttribute('aria-expanded', 'true');
  }

  private async findChevronButton() {
    return findFirstChevronButton(await this.page.getByRole('button').all());
  }

  private async openSpecifyTopicsTab() {
    const specifyTab = this.page.getByRole('tab', { name: /specify topics/iu });
    await specifyTab.waitFor({ state: 'visible', timeout: 5000 });
    await specifyTab.click();

    await expect(this.page.getByTestId('topics-filters-container')).toBeVisible();
  }

  // WARNING: Re-query the delete buttons after each click; card removal changes the rendered list.
  private async clearTopicFilters() {
    if (await this.clickFirstTrashButton()) {
      await this.clearTopicFilters();
    }
  }

  private async clickFirstTrashButton() {
    const topicFilters = this.page.locator(TOPIC_FILTER_NAME_INPUTS);
    const filterCount = await topicFilters.count();
    const clicked = await this.clickFirstTrashButtonOf(await this.page.getByRole('button').all());
    if (clicked) {
      await expect(topicFilters).toHaveCount(filterCount - 1);
    }
    return clicked;
  }

  private async clickFirstTrashButtonOf([btn, ...remainingButtons]: Locator[]): Promise<boolean> {
    if (!btn) {
      return false;
    }
    try {
      if (await btn.evaluate(isTrashButton)) {
        await btn.click();
        return true;
      }
    } catch {
      // WARNING: A previous click may have removed this button; skip the stale element.
    }
    return this.clickFirstTrashButtonOf(remainingButtons);
  }

  private async addTopicFilter(filter: TopicFilter, filterIndex: number) {
    await this.page.getByRole('button', { name: /add filter/iu }).click();
    await expect(this.page.getByTestId(`topic-filter-${filterIndex}`)).toBeVisible();

    await this.selectTopicFilterTab(filter, filterIndex);

    const inputInCard = this.page.locator(`[data-testid="topic-filter-${filterIndex}-name"]`);
    await inputInCard.click();
    await inputInCard.fill(filter.pattern);
    await expect(inputInCard).toHaveValue(filter.pattern);
  }

  private async selectTopicFilterTab(filter: TopicFilter, filterIndex: number) {
    const targetTab = this.page
      .getByRole('tab', { name: TOPIC_FILTER_TAB_LABELS[filter.filter][filter.type] })
      .nth(filterIndex);
    await targetTab.waitFor({ state: 'visible', timeout: 5000 });
    await targetTab.click();
    await expect(targetTab).toHaveAttribute('aria-selected', 'true');
  }

  // WARNING: The legacy edit form requires the SCRAM password again even for a filter-only save.
  private async fillSourcePasswordForSave() {
    const sourceTab = this.page.getByRole('tab', { name: /source/iu });
    await sourceTab.click();
    await expect(sourceTab).toHaveAttribute('aria-selected', 'true');

    const passwordInput = this.page.getByRole('textbox', { name: /password/iu });
    await passwordInput.click();
    await passwordInput.fill('very-secret');
    await expect(passwordInput).toHaveValue('very-secret');
  }

  /**
   * Actions
   */
  async performFailover() {
    const failoverButton = this.page.getByRole('button', { name: /^fail ?over all topics$/iu });
    await failoverButton.click();

    // WARNING: Arm the response listener before confirming; the dialog closes before the failover request settles.
    const confirmButton = this.page.getByTestId('confirm-failover');
    await Promise.all([this.page.waitForResponse(FAILOVER_RPC_URL), confirmButton.click()]);
  }

  async failoverTopic(topicName: string) {
    const topicRow = this.page.getByRole('row').filter({ hasText: topicName });
    const failoverButton = topicRow.getByRole('button', { name: /failover/iu });
    await failoverButton.click();

    // WARNING: Wait for the failover response before refreshing; closing the dialog is not completion.
    const confirmButton = this.page.getByTestId('confirm-failover');
    await Promise.all([this.page.waitForResponse(FAILOVER_RPC_URL), confirmButton.click()]);

    const refreshButton = this.page.getByTestId('refresh-topics-button');
    await Promise.all([this.page.waitForResponse(LIST_SHADOW_TOPICS_RPC_URL), refreshButton.click()]);

    const topicRowAfterRefresh = this.page.getByRole('row').filter({ hasText: topicName });
    await expect(topicRowAfterRefresh.getByText(/failed over/iu)).toBeVisible({ timeout: 5000 });
  }

  async deleteShadowlink() {
    const deleteButton = this.page.getByRole('button', { name: /delete/iu });
    await deleteButton.click();

    await expect(this.page.getByRole('alertdialog', { name: 'Delete Shadowlink' })).toBeVisible();

    const confirmInput = this.page.getByRole('textbox', { name: /type.*delete|confirm/iu });
    await confirmInput.fill('delete');

    const confirmButton = this.page.getByRole('button', { name: /delete/iu }).last();
    await expect(confirmButton).toBeEnabled();

    await confirmButton.click();

    await expect(this.page).toHaveURL(`${this.shadowBackendURL}/shadowlinks`, { timeout: 15_000 });

    await this.cleanupDestinationTopics();
  }

  cleanupDestinationTopics = cleanupDestinationTopics;

  /**
   * Helper methods
   */
  async clickTab(tabName: 'Overview' | 'Tasks' | 'Configuration') {
    const tab = this.page.getByRole('tab', { name: new RegExp(tabName, 'iu') });
    await tab.click();
    await expect(tab).toHaveAttribute('aria-selected', 'true');
  }
}

async function cleanupDestinationTopics() {
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
