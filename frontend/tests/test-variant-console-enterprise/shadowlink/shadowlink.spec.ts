/** biome-ignore-all lint/performance/useTopLevelRegex: e2e test */

import { generateShadowlinkName, ShadowlinkPage } from '../../test-variant-console/utils/shadowlink-page';
import { expect, test } from '../fixtures';

test.describe('Shadow Link E2E Tests', () => {
  test.describe('Shadow Link Creation', () => {
    test('should fill connection step successfully', async ({ page, shadowBackendURL }) => {
      const shadowlinkPage = new ShadowlinkPage(page, shadowBackendURL);
      const shadowlinkName = generateShadowlinkName();

      await test.step('Navigate to create page', async () => {
        await shadowlinkPage.gotoCreate();
      });

      await test.step('Fill connection details with SCRAM', async () => {
        await shadowlinkPage.fillConnectionStep({
          name: shadowlinkName,
          bootstrapServers: 'redpanda:9092', // Source cluster (existing)
          username: 'e2euser',
          password: 'very-secret',
          mechanism: 'SCRAM-SHA-256',
        });
      });

      await test.step('Verify we reached configuration step', async () => {
        // After clicking Next, we should be on step 2 (Configuration)
        await expect(page.getByRole('heading', { name: /configuration/i })).toBeVisible();
      });
    });

    test('should create, update, failover, and delete shadowlink', async ({ page, shadowBackendURL }) => {
      const shadowlinkPage = new ShadowlinkPage(page, shadowBackendURL);
      const shadowlinkName = generateShadowlinkName();

      await test.step('Create shadowlink with literal filter', async () => {
        await shadowlinkPage.createShadowlink({
          name: shadowlinkName,
          bootstrapServers: 'redpanda:9092', // Source cluster
          username: 'e2euser',
          password: 'very-secret',
          topicFilters: [
            {
              type: 'LITERAL',
              filter: 'INCLUDE',
              pattern: 'owlshop-orders',
            },
          ],
        });
      });

      await test.step('Verify shadowlink appears on home page', async () => {
        await shadowlinkPage.verifyOnHomePage(shadowlinkName);
      });

      await test.step('Verify topic synced on details page', async () => {
        await shadowlinkPage.gotoDetails(shadowlinkName);
        await shadowlinkPage.verifyTopicExists('owlshop-orders');
      });

      await test.step('Update to prefix filter', async () => {
        await shadowlinkPage.gotoEdit(shadowlinkName);
        await shadowlinkPage.updateTopicFilters([
          {
            type: 'PREFIX',
            filter: 'INCLUDE',
            pattern: 'owlshop-',
          },
        ]);
      });

      await test.step('Failover single topic and wait for all topics', async () => {
        await shadowlinkPage.gotoDetails(shadowlinkName);
        // Failover single topic (will verify state change)
        await shadowlinkPage.failoverTopic('owlshop-orders');
      });

      await test.step('Failover all topics', async () => {
        // Wait for all 7 topics to sync (uses metrics which is faster)
        await shadowlinkPage.verifyMetrics({
          totalTopics: 7,
        });
        await shadowlinkPage.performFailover();
      });

      await test.step('Verify all topics failed over', async () => {
        await shadowlinkPage.gotoDetails(shadowlinkName);
        await shadowlinkPage.verifyMetrics({
          totalTopics: 7,
          failedOverTopics: 7,
          errorTopics: 0,
        });
      });

      await test.step('Delete shadowlink', async () => {
        await shadowlinkPage.deleteShadowlink();
      });

      await test.step('Verify shadowlink deleted', async () => {
        await shadowlinkPage.verifyNotInList(shadowlinkName);
      });
    });
  });

  test.describe('Shadow Link Filter', () => {
    test.skip(!!process.env.CI, 'Flaky in CI - timing issues with metrics loading');
    test('should create with exclude filter and verify it works', async ({ page, shadowBackendURL }) => {
      const shadowlinkPage = new ShadowlinkPage(page, shadowBackendURL);
      const shadowlinkName = generateShadowlinkName();

      await test.step('Create with include-all and exclude addresses filter', async () => {
        await shadowlinkPage.createShadowlink({
          name: shadowlinkName,
          bootstrapServers: 'redpanda:9092', // Source cluster
          username: 'e2euser',
          password: 'very-secret',
          topicFilters: [
            {
              type: 'LITERAL',
              filter: 'INCLUDE',
              pattern: '*',
            },
            {
              type: 'LITERAL',
              filter: 'EXCLUDE',
              pattern: 'owlshop-addresses',
            },
          ],
        });
      });

      await test.step('Wait for topics to sync (excluding addresses)', async () => {
        await shadowlinkPage.gotoDetails(shadowlinkName);
        // Wait for 9 topics (10 total - 1 excluded addresses)
        await shadowlinkPage.verifyMetrics({
          totalTopics: 9,
        });
      });

      await test.step('Verify addresses topic is excluded', async () => {
        // Should not see owlshop-addresses in the topics list
        await expect(page.getByTestId('shadowlink-topic-owlshop-addresses')).not.toBeVisible();
      });
    });
  });
});
