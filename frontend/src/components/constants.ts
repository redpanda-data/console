export const DEFAULT_TABLE_PAGE_SIZE = 50;
export const DEFAULT_API_BASE = './api' as const;

export const BUILDER_API_KEY = '4abd0efa0759420b88149ada5c1eb216';

/**
 * Default Console feature flags.
 * Dark mode is standalone-only: the next load shows the theme switch and defaults to the OS preference.
 * Embedded Console uses the host theme.
 * The cluster fencing flag is embedded-only; standalone uses broker capability discovery.
 */
export const FEATURE_FLAGS = {
  enableRpcnPipelineDrafts: false,
  enableRpcnTemplateGallery: false,
  enableRpcnVisualEditor: false,
  enableDataplaneObservabilityServerless: false,
  enableDataplaneObservability: false,
  enableNewPipelineLogs: false,
  enablePipelineDiagrams: false,
  enableConnectSlashMenu: false,
  enableNewTopicMessagesPage: false,
  enableClusterFencing: false,
  enableServerlessEgressGateway: false,
  enableDarkMode: false,
};

export const CLOUD_MANAGED_TAG_KEYS = {
  SERVICE_ACCOUNT_ID: 'rp_cloud_service_account_id',
  SECRET_ID: 'rp_cloud_secret_id',
} as const;

const isCloudManagedTagKey = (key: string) =>
  Object.values(CLOUD_MANAGED_TAG_KEYS).includes(
    key as (typeof CLOUD_MANAGED_TAG_KEYS)[keyof typeof CLOUD_MANAGED_TAG_KEYS]
  );

/** Returns true if the tag key is a system tag that should be hidden from users. */
export const isSystemTag = (key: string) => key.startsWith('__') || isCloudManagedTagKey(key);

/** User-visible tags (system tags filtered out) as `{ key, value }` entries. */
export const getUserTagEntries = (tags: Record<string, string>) =>
  Object.entries(tags)
    .filter(([k]) => !isSystemTag(k))
    .map(([key, value]) => ({ key, value }));
