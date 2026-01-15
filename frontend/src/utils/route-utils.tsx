/**
 * Copyright 2026 Redpanda Data, Inc.
 *
 * Use of this software is governed by the Business Source License
 * included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
 *
 * As of the Change Date specified in that file, in accordance with
 * the Business Source License, use of this software will be governed
 * by the Apache License, Version 2.0
 */

/**
 * Route utilities for TanStack Router integration.
 * Provides sidebar item generation and visibility management.
 */

import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

import { type AppFeature, AppFeatures } from './env';
import {
  ActivityIcon,
  AIIcon,
  BeakerIcon,
  BookOpenIcon,
  CollectionIcon,
  CubeIcon,
  FilterIcon,
  HomeIcon,
  KeyIcon,
  LinkIcon,
  ScaleIcon,
  ShieldCheckIcon,
  ShieldIcon,
  UserCircleIcon,
} from '../components/icons';
import { MCPIcon } from '../components/redpanda-ui/components/icons';
import { isEmbedded, isFeatureFlagEnabled, isServerless } from '../config';
import { api } from '../state/backend-api';
import { Feature, isSupported, shouldHideIfNotSupported } from '../state/supported-features';

// NavLinkProps type compatible with @redpanda-data/ui Sidebar
type NavLinkProps = {
  title: string;
  to: string;
  // biome-ignore lint/suspicious/noExplicitAny: matches @redpanda-data/ui type
  icon: any;
  isDisabled?: boolean;
  disabledText?: string;
};

// Sidebar item definition
export type SidebarItem = {
  path: string;
  title: string | ReactNode;
  icon?: LucideIcon | ((props: React.SVGProps<SVGSVGElement>) => JSX.Element);
  visibilityCheck?: () => MenuItemState;
  group?: string; // For grouping related items (e.g., "Agentic AI")
  isBeta?: boolean; // For displaying beta badge
};

// Visibility state for menu items
export type MenuItemState = {
  visible: boolean;
  disabledReasons: DisabledReason[];
};

const DisabledReasons = {
  notSupported: 0, // kafka cluster version too low
  noPermission: 1, // user doesn't have permissions to use the feature
  enterpriseFeature: 2,
  notSupportedServerless: 3, // This feature is not supported in serverless mode
} as const;

type DisabledReason = (typeof DisabledReasons)[keyof typeof DisabledReasons];

// Permission keys from UserData type (excluding non-boolean keys)
type UserPermissions =
  | 'canViewConsoleUsers'
  | 'canListAcls'
  | 'canListQuotas'
  | 'canReassignPartitions'
  | 'canPatchConfigs'
  | 'canCreateRoles'
  | 'canManageUsers'
  | 'canViewPermissionsList'
  | 'canManageLicense'
  | 'canViewSchemas'
  | 'canCreateSchemas'
  | 'canDeleteSchemas'
  | 'canManageSchemaRegistry'
  | 'canViewDebugBundle'
  | 'canListTransforms'
  | 'canCreateTransforms'
  | 'canDeleteTransforms';

/**
 * Check if required features are supported.
 * Returns [shouldHide, disabledReason] tuple.
 */
function checkFeatureSupport(
  features: Parameters<typeof isSupported>[0][] | undefined
): [boolean, DisabledReason | null] {
  if (!features) {
    return [false, null];
  }
  for (const f of features) {
    if (!isSupported(f)) {
      if (shouldHideIfNotSupported(f)) {
        return [true, null];
      }
      return [false, DisabledReasons.notSupported];
    }
  }
  return [false, null];
}

/**
 * Check if user has required permissions.
 */
function checkPermissions(permissions: UserPermissions[] | undefined): DisabledReason | null {
  if (!(permissions && api.userData)) {
    return null;
  }
  for (const p of permissions) {
    if (!api.userData[p]) {
      return DisabledReasons.noPermission;
    }
  }
  return null;
}

/**
 * Check if app features are enabled.
 */
function checkAppFeatures(appFeatures: AppFeature[] | undefined): DisabledReason | null {
  if (!appFeatures) {
    return null;
  }
  for (const f of appFeatures) {
    if (AppFeatures[f] === false) {
      return DisabledReasons.enterpriseFeature;
    }
  }
  return null;
}

/**
 * Creates a visibility check function for route items.
 */
function routeVisibility(
  visible: boolean | (() => boolean),
  requiredFeatures?: Parameters<typeof isSupported>[0][],
  requiredPermissions?: UserPermissions[],
  requiredAppFeatures?: AppFeature[]
): () => MenuItemState {
  return () => {
    let v = typeof visible === 'boolean' ? visible : visible();
    const disabledReasons: DisabledReason[] = [];

    const [shouldHide, featureReason] = checkFeatureSupport(requiredFeatures);
    if (shouldHide) {
      v = false;
    }
    if (featureReason !== null) {
      disabledReasons.push(featureReason);
    }

    const permReason = checkPermissions(requiredPermissions);
    if (permReason !== null) {
      disabledReasons.push(permReason);
    }

    const appFeatureReason = checkAppFeatures(requiredAppFeatures);
    if (appFeatureReason !== null) {
      disabledReasons.push(appFeatureReason);
    }

    return { visible: v, disabledReasons };
  };
}

/**
 * Sidebar items configuration with visibility rules.
 * Ordered by display order in the sidebar.
 */
export const SIDEBAR_ITEMS: SidebarItem[] = [
  {
    path: '/overview',
    title: 'Overview',
    icon: HomeIcon,
    visibilityCheck: routeVisibility(true),
  },
  {
    path: '/topics',
    title: 'Topics',
    icon: CollectionIcon,
    visibilityCheck: routeVisibility(true),
  },
  {
    path: '/schema-registry',
    title: 'Schema Registry',
    icon: CubeIcon,
    visibilityCheck: routeVisibility(true),
  },
  {
    path: '/groups',
    title: 'Consumer Groups',
    icon: FilterIcon,
    visibilityCheck: routeVisibility(true, [Feature.ConsumerGroups]),
  },
  {
    path: '/secrets',
    title: 'Secrets Store',
    icon: KeyIcon,
    visibilityCheck: routeVisibility(() => isEmbedded(), [Feature.PipelineService]),
  },
  {
    path: '/knowledgebases',
    title: 'Knowledge Bases',
    icon: BookOpenIcon,
    visibilityCheck: routeVisibility(
      () => isFeatureFlagEnabled('enableKnowledgeBaseInConsoleUi'),
      [Feature.PipelineService]
    ),
  },
  {
    path: '/security',
    title: 'Security',
    icon: ShieldCheckIcon,
    visibilityCheck: routeVisibility(true),
  },
  {
    path: '/quotas',
    title: 'Quotas',
    icon: ScaleIcon,
    visibilityCheck: routeVisibility(true, [Feature.GetQuotas], ['canListQuotas']),
  },
  {
    path: '/connect-clusters',
    title: 'Connect',
    icon: LinkIcon,
    visibilityCheck: () => {
      if (isServerless()) {
        if (isSupported(Feature.PipelineService)) {
          return { visible: true, disabledReasons: [] };
        }
        return { visible: false, disabledReasons: [DisabledReasons.notSupported] };
      }
      return { visible: true, disabledReasons: [] };
    },
  },
  {
    path: '/transforms',
    title: 'Transforms',
    icon: AIIcon,
    visibilityCheck: routeVisibility(true, [Feature.TransformsService]),
  },
  {
    path: '/traces',
    title: 'Traces',
    icon: ActivityIcon,
    visibilityCheck: routeVisibility(
      () => isEmbedded() && isFeatureFlagEnabled('enableTracingInConsole'),
      [Feature.TracingService]
    ),
  },
  {
    path: '/reassign-partitions',
    title: 'Reassign Partitions',
    icon: BeakerIcon,
    visibilityCheck: routeVisibility(
      true,
      [Feature.GetReassignments, Feature.PatchReassignments],
      ['canPatchConfigs', 'canReassignPartitions'],
      ['REASSIGN_PARTITIONS']
    ),
  },
  {
    path: '/mcp-servers',
    title: 'Remote MCP',
    icon: MCPIcon,
    visibilityCheck: routeVisibility(() => isEmbedded() && isFeatureFlagEnabled('enableRemoteMcpInConsole')),
  },
  {
    path: '/shadowlinks',
    title: 'Shadow Links',
    icon: ShieldIcon,
    visibilityCheck: routeVisibility(() => {
      if (isEmbedded()) {
        return isFeatureFlagEnabled('shadowlinkCloudUi');
      }
      return true;
    }),
  },
  {
    path: '/agents',
    title: 'AI Agents',
    icon: UserCircleIcon,
    visibilityCheck: routeVisibility(
      () =>
        isEmbedded() &&
        (!isServerless() || isFeatureFlagEnabled('enableAiAgentsInConsoleServerless')) &&
        isFeatureFlagEnabled('enableAiAgentsInConsole')
    ),
  },
];

// Routes that should be hidden in embedded mode
const routesIgnoredInEmbedded = ['/overview', '/reassign-partitions', '/admin'];

// Routes that should be hidden in serverless mode
const routesIgnoredInServerless = ['/overview', '/quotas', '/reassign-partitions', '/admin', '/transforms'];

// Routes with beta badge suffix
const BETA_ROUTES = ['/knowledgebases', '/agents'];

/**
 * Process a single sidebar item for legacy sidebar display.
 */
function processSidebarItem(item: SidebarItem): NavLinkProps | null {
  if (!item.icon) {
    return null;
  }

  const visibility = item.visibilityCheck?.() ?? { visible: true, disabledReasons: [] };
  if (!visibility.visible) {
    return null;
  }

  const isEnabled = visibility.disabledReasons.length === 0;
  const disabledText = getDisabledText(visibility.disabledReasons);
  const title = formatTitle(item.path, String(item.title));

  return {
    title,
    to: item.path,
    icon: item.icon,
    isDisabled: !isEnabled,
    disabledText: disabledText || undefined,
  };
}

/**
 * Get disabled text from disabled reasons.
 */
function getDisabledText(reasons: DisabledReason[]): string {
  const firstReason = reasons[0];
  if (firstReason === undefined) {
    return '';
  }
  // Simplified text extraction - just return the key message
  const textMap: Record<DisabledReason, string> = {
    [DisabledReasons.noPermission]: "You don't have permissions to view this page.",
    [DisabledReasons.notSupported]: 'The Kafka cluster does not support this feature.',
    [DisabledReasons.enterpriseFeature]: 'This feature requires an enterprise license.',
    [DisabledReasons.notSupportedServerless]: 'This feature is not yet supported for Serverless.',
  };
  return textMap[firstReason];
}

/**
 * Format title with beta suffix if needed.
 */
function formatTitle(path: string, title: string): string {
  return BETA_ROUTES.includes(path) ? `${title} (beta)` : title;
}

/**
 * Creates visible sidebar items for the legacy @redpanda-data/ui Sidebar.
 */
export function createVisibleSidebarItems(): NavLinkProps[] {
  return SIDEBAR_ITEMS.map(processSidebarItem).filter((item): item is NavLinkProps => item !== null);
}

/**
 * Get filtered routes for embedded mode.
 * Used by config.ts for embeddedAvailableRoutesObservable.
 */
export function getEmbeddedAvailableRoutes(): SidebarItem[] {
  return SIDEBAR_ITEMS.map((item) => {
    // Mark AI-related routes with group and beta flag
    if (item.path === '/knowledgebases' || item.path === '/agents') {
      return {
        ...item,
        group: 'Agentic AI',
        isBeta: true,
      };
    }

    return item;
  })
    .filter((x) => x.icon !== null && x.icon !== undefined) // Routes without icon are "nested"
    .filter((x) => !routesIgnoredInEmbedded.includes(x.path)) // Things that should not be visible in embedded/cloud mode
    .filter((x) => {
      if (x.visibilityCheck) {
        const state = x.visibilityCheck();
        return state.visible;
      }
      return true;
    })
    .filter((x) => {
      if (isServerless() && routesIgnoredInServerless.includes(x.path)) {
        return false;
      }
      return true;
    });
}

// Re-export types for backwards compatibility
export type { MenuItemState as RouteMenuItemState };
