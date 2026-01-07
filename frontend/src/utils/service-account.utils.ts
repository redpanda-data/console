import { CLOUD_MANAGED_TAG_KEYS } from 'components/constants';
import { config } from 'config';

export type ServiceAccountResourceType = 'mcp' | 'agent' | 'pipeline';

/**
 * Adds cloud-managed service account tags to tags map
 */
export function addServiceAccountTags(
  tagsMap: Record<string, string>,
  serviceAccountId: string,
  secretName: string
): void {
  tagsMap[CLOUD_MANAGED_TAG_KEYS.SERVICE_ACCOUNT_ID] = serviceAccountId;
  tagsMap[CLOUD_MANAGED_TAG_KEYS.SECRET_ID] = secretName;
}

/**
 * Generates service account name following convention:
 * {cluster-type}-{cluster-id}-{resource-type}-{sanitized-name}-sa
 */
export function generateServiceAccountName(displayName: string, resourceType: ServiceAccountResourceType): string {
  const clusterType = config.isServerless ? 'serverless' : 'cluster';
  const sanitizedName = displayName.toLowerCase().replace(/[^a-z0-9-]/g, '-');
  return `${clusterType}-${config.clusterId}-${resourceType}-${sanitizedName}-sa`;
}

/**
 * Gets the prefix used for auto-generated service account names
 */
export function getServiceAccountNamePrefix(resourceType: ServiceAccountResourceType): string {
  const clusterType = config.isServerless ? 'serverless' : 'cluster';
  return `${clusterType}-${config.clusterId}-${resourceType}-`;
}
