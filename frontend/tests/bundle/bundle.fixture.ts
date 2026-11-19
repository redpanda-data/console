import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { brotliCompressSync, gzipSync } from 'node:zlib';
import { test as base, type Page, type Route, type TestArtifacts } from '../shared/e2e';

export const buildDirectory = resolve(process.env.BUNDLE_BUILD_DIR ?? 'build');

const topic = {
  topicName: 'bundle-test',
  isInternal: false,
  partitionCount: 1,
  replicationFactor: 1,
  cleanupPolicy: 'delete',
  documentation: 'AVAILABLE',
  logDirSummary: { totalSizeBytes: 0, replicaErrors: [], hint: null },
  allowedActions: ['all'],
};

const responses: Record<string, unknown> = {
  '/api/topics': { topics: [topic] },
  '/api/brokers': [],
  '/api/schema-registry/subjects': [],
  '/api/cluster': {},
  '/api/topics/bundle-test/configuration': {
    topicDescription: { topicName: topic.topicName, error: null, configEntries: [] },
  },
  '/api/topics/bundle-test/partitions': {
    partitions: [
      {
        id: 0,
        partitionError: null,
        waterMarksError: null,
        replicas: [0],
        inSyncReplicas: [0],
        offlineReplicas: [],
        leader: 0,
        partitionLogDirs: [],
        waterMarkLow: 0,
        waterMarkHigh: 0,
      },
    ],
  },
  '/api/topics/bundle-test/documentation': {
    topicName: topic.topicName,
    documentation: {
      isEnabled: true,
      markdown: Buffer.from(
        '# Bundle documentation\n\nHello :smile:\n\n```json\n{"hello":"world"}\n```\n\n[unsafe](javascript:alert(1))\n\n| Key | Value |\n| --- | --- |\n| x | y |'
      ).toString('base64'),
    },
  },
  '/api/console/endpoints': {
    endpointCompatibility: {
      endpoints: [
        { endpoint: '/api/cluster/config', method: 'GET', isSupported: true },
        { endpoint: '/api/consumer-groups', method: 'GET', isSupported: true },
        { endpoint: '/api/operations/reassign-partitions', method: 'GET', isSupported: true },
        { endpoint: '/api/operations/reassign-partitions', method: 'PATCH', isSupported: true },
        { endpoint: '/api/consumer-groups/{groupId}', method: 'PATCH', isSupported: true },
        { endpoint: '/api/consumer-groups/{groupId}', method: 'DELETE', isSupported: true },
        { endpoint: '/api/consumer-groups/{groupId}/offsets', method: 'DELETE', isSupported: true },
        { endpoint: '/api/topics/{topicName}/records', method: 'DELETE', isSupported: true },
        { endpoint: '/api/quotas', method: 'GET', isSupported: true },
        { endpoint: '/api/users', method: 'POST', isSupported: true },
        { endpoint: '/api/users', method: 'DELETE', isSupported: true },
        { endpoint: 'redpanda.api.console.v1alpha1.SecurityService', method: 'POST', isSupported: true },
        { endpoint: 'redpanda.api.console.v1alpha1.TransformService', method: 'POST', isSupported: true },
        { endpoint: 'redpanda.api.console.v1alpha1.PipelineService', method: 'POST', isSupported: true },
        { endpoint: 'redpanda.api.console.v1alpha1.DebugBundleService', method: 'POST', isSupported: true },
        { endpoint: 'redpanda.api.console.v1alpha1.SecretService', method: 'POST', isSupported: true },
        { endpoint: 'redpanda.api.console.v1alpha1.ShadowLinkService', method: 'POST', isSupported: true },
        { endpoint: 'redpanda.api.dataplane.v1.ACLService', method: 'POST', isSupported: true },
        { endpoint: '/api/shadow-links/schema-registry-sync', method: 'GET', isSupported: true },
        { endpoint: '/api/shadow-links/role-sync', method: 'GET', isSupported: true },
        { endpoint: '/api/schema-registry/contexts', method: 'GET', isSupported: true },
        { endpoint: 'redpanda.api.dataplane.v1alpha3.SQLService', method: 'POST', isSupported: true },
      ],
    },
  },
  GetKafkaInfo: { clusterId: 'bundle-fixture', brokers: [], version: '4.0.0' },
  GetConsoleInfo: { version: 'bundle-fixture' },
  ListEnterpriseFeatures: {},
  ListLicenses: {},
  GetKafkaAuthorizerInfo: {},
  GetRedpandaInfo: {},
  GetKafkaConnectInfo: {},
  GetClusterHealth: {},
  GetDebugBundleStatus: {},
  GetIdentity: {},
  ListShadowLinks: {},
  ListPipelines: { response: { pipelines: [] } },
  ListComponents: { components: {} },
  ListSecrets: { response: { secrets: [] } },
  GetPipelinesBySecrets: { response: { pipelinesForSecret: [] } },
};

// Third-party telemetry and content are stubbed so tests never depend on hosted services.
async function fulfillThirdPartyRequest(route: Route) {
  const response =
    route.request().resourceType() === 'script'
      ? { contentType: 'application/javascript', body: '' }
      : { contentType: 'application/json', body: '{"results":[]}' };
  await route.fulfill(response);
}

// An empty Connect server stream: one end-of-stream envelope with no messages.
async function fulfillEmptyMessageStream(route: Route) {
  const end = Buffer.from('{"metadata":{}}');
  const header = Buffer.alloc(5);
  header[0] = 2;
  header.writeUInt32BE(end.length, 1);
  await route.fulfill({
    status: 200,
    contentType: 'application/connect+json',
    body: Buffer.concat([header, end]),
  });
}

async function fulfillApiFixture(route: Route, path: string) {
  const key = path.startsWith('/api/') ? path : (path.split('/').at(-1) ?? '');
  const json = responses[key];
  if (json === undefined) {
    throw new Error(`Missing bundle API fixture: ${path}`);
  }
  await route.fulfill({ status: 200, contentType: 'application/json', json });
}

async function routeLocalRequest(route: Route, path: string) {
  if (!(path.startsWith('/api/') || path.startsWith('/redpanda.api.'))) {
    await route.continue();
    return;
  }
  if (path.endsWith('/ListMessages')) {
    await fulfillEmptyMessageStream(route);
    return;
  }
  await fulfillApiFixture(route, path);
}

async function routeBundleRequest(route: Route) {
  const url = new URL(route.request().url());
  if (url.hostname !== '127.0.0.1') {
    await fulfillThirdPartyRequest(route);
    return;
  }
  await routeLocalRequest(route, url.pathname);
}

export const test = base.extend<{ errors: string[] }>({
  errors: [
    async ({ context, page }, use) => {
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      page.on('console', (message) => {
        if (message.type() === 'error') {
          errors.push(message.text());
        }
      });
      await context.route('**/*', routeBundleRequest);
      await use(errors);
    },
    { auto: true },
  ],
});

export function trackScripts(page: Page) {
  const paths = new Set<string>();
  page.on('request', (request) => {
    if (request.resourceType() === 'script') {
      paths.add(new URL(request.url()).pathname);
    }
  });
  return paths;
}

export function trackWorkers(page: Page) {
  const workers: string[] = [];
  page.on('worker', (worker) => workers.push(worker.url()));
  return workers;
}

export async function attachJson(testInfo: TestArtifacts, name: string, value: unknown) {
  await writeFile(testInfo.outputPath(name), JSON.stringify(value, null, 2));
  await testInfo.attach(name, { path: testInfo.outputPath(name), contentType: 'application/json' });
}

export async function attachScreenshot(page: Page, testInfo: TestArtifacts, name: string) {
  await page.screenshot({ path: testInfo.outputPath(name) });
  await testInfo.attach(name, { path: testInfo.outputPath(name), contentType: 'image/png' });
}

export async function measure(paths: Iterable<string>) {
  const assets = await Promise.all(
    [...new Set(paths)]
      .filter((path) => path.endsWith('.js'))
      .map(async (path) => {
        const bytes = await readFile(resolve(buildDirectory, `.${path}`));
        return { path, raw: bytes.length, gzip: gzipSync(bytes).length, brotli: brotliCompressSync(bytes).length };
      })
  );
  return {
    assets,
    totals: assets.reduce(
      (sum, asset) => ({ raw: sum.raw + asset.raw, gzip: sum.gzip + asset.gzip, brotli: sum.brotli + asset.brotli }),
      { raw: 0, gzip: 0, brotli: 0 }
    ),
  };
}
