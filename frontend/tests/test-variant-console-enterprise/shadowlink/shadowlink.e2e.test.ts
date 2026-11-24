import { step } from '../../shared/e2e';

/* biome-ignore-all lint/performance/useTopLevelRegex: e2e test */

import { generateShadowlinkName, ShadowlinkPage } from '../../test-variant-console/utils/shadowlink-page';
import { expect, test } from '../console-enterprise.fixture';

/** Fails over `owlshop-orders` alone, then every topic once all 7 have synced, and verifies the result. */
const failOverOneTopicThenAll = async (shadowlinkPage: ShadowlinkPage, shadowlinkName: string) => {
  await step('Failover single topic and wait for all topics', async () => {
    await shadowlinkPage.gotoDetails(shadowlinkName);
    await shadowlinkPage.failoverTopic('owlshop-orders');
  });

  await step('Failover all topics', async () => {
    await shadowlinkPage.verifyMetrics({
      totalTopics: 7,
    });
    await shadowlinkPage.performFailover();
  });

  await step('Verify all topics failed over', async () => {
    await shadowlinkPage.gotoDetails(shadowlinkName);
    await shadowlinkPage.verifyMetrics({
      totalTopics: 7,
      failedOverTopics: 7,
      errorTopics: 0,
    });
  });
};

test.describe('shadow Link E2E Tests', () => {
  test.describe('shadow Link Creation', () => {
    test('should fill connection step successfully', async ({ page, shadowBackendURL }) => {
      const shadowlinkPage = new ShadowlinkPage(page, shadowBackendURL);
      const shadowlinkName = generateShadowlinkName();

      await step('Navigate to create page', async () => {
        await shadowlinkPage.gotoCreate();
      });

      await step('Fill connection details with SCRAM', async () => {
        await shadowlinkPage.fillConnectionStep({
          name: shadowlinkName,
          bootstrapServers: 'redpanda:9092',
          username: 'e2euser',
          password: 'very-secret',
          mechanism: 'SCRAM-SHA-256',
        });
      });

      await step('Verify we reached configuration step', async () => {
        await expect(page.getByRole('heading', { name: /configuration/iu })).toBeVisible();
      });
    });

    test('should create, update, failover, and delete shadowlink', async ({ page, shadowBackendURL }) => {
      const shadowlinkPage = new ShadowlinkPage(page, shadowBackendURL);
      const shadowlinkName = generateShadowlinkName();

      await step('Create shadowlink with literal filter', async () => {
        await shadowlinkPage.createShadowlink({
          name: shadowlinkName,
          bootstrapServers: 'redpanda:9092',
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

      await step('Verify shadowlink appears on home page', async () => {
        await shadowlinkPage.verifyOnHomePage(shadowlinkName);
      });

      await step('Verify topic synced on details page', async () => {
        await shadowlinkPage.gotoDetails(shadowlinkName);
        await shadowlinkPage.verifyTopicExists('owlshop-orders');
      });

      await step('Update to prefix filter', async () => {
        await shadowlinkPage.gotoEdit(shadowlinkName);
        await shadowlinkPage.updateTopicFilters([
          {
            type: 'PREFIX',
            filter: 'INCLUDE',
            pattern: 'owlshop-',
          },
        ]);
      });

      await failOverOneTopicThenAll(shadowlinkPage, shadowlinkName);

      await step('Delete shadowlink', async () => {
        await shadowlinkPage.deleteShadowlink();
      });

      await step('Verify shadowlink deleted', async () => {
        await shadowlinkPage.verifyNotInList(shadowlinkName);
      });
    });
  });

  test.describe.skipIf(!!process.env.CI)('shadow Link Filter', () => {
    test('should create with exclude filter and verify it works', async ({ page, shadowBackendURL }) => {
      const shadowlinkPage = new ShadowlinkPage(page, shadowBackendURL);
      const shadowlinkName = generateShadowlinkName();

      await step('Create with include-all and exclude addresses filter', async () => {
        await shadowlinkPage.createShadowlink({
          name: shadowlinkName,
          bootstrapServers: 'redpanda:9092',
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

      await step('Wait for topics to sync (excluding addresses)', async () => {
        await shadowlinkPage.gotoDetails(shadowlinkName);
        await shadowlinkPage.verifyMetrics({
          totalTopics: 9,
        });
      });

      await step('Verify addresses topic is excluded', async () => {
        await expect(page.getByTestId('shadowlink-topic-owlshop-addresses')).not.toBeVisible();
      });
    });
  });
});
