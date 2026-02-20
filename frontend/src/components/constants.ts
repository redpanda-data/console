export const DEFAULT_TABLE_PAGE_SIZE = 50;
export const DEFAULT_API_BASE = './api' as const;

// Builder.io API Key (public key for OSS)
export const BUILDER_API_KEY = '4abd0efa0759420b88149ada5c1eb216';

// By default, most feature flags will be false when there's no embedded mode on.
export const FEATURE_FLAGS = {
  enableKnowledgeBaseInConsoleUi: false,
  enableRpcnTiles: false,
  enableServerlessOnboardingWizard: false,
  enableApiKeyConfigurationAgent: false,
  enableDataplaneObservabilityServerless: false,
  enableDataplaneObservability: false,
};

// Cloud-managed tag keys for service account integration
// These tags are created automatically
// and are critical for cleanup operations during deletion in Redpanda Cloud
export const CLOUD_MANAGED_TAG_KEYS = {
  SERVICE_ACCOUNT_ID: 'rp_cloud_service_account_id',
  SECRET_ID: 'rp_cloud_secret_id',
} as const;

// Helper function to check if a tag key is cloud-managed
export const isCloudManagedTagKey = (key: string): boolean =>
  Object.values(CLOUD_MANAGED_TAG_KEYS).includes(
    key as (typeof CLOUD_MANAGED_TAG_KEYS)[keyof typeof CLOUD_MANAGED_TAG_KEYS]
  );
