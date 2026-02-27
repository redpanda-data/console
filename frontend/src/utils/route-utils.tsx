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
import { isAdpEnabled, isEmbedded, isFeatureFlagEnabled, isServerless } from '../config';
import { api } from '../state/backend-api';
import { Feature, isSupported, shouldHideIfNotSupported } from '../state/supported-features';

const SidebarSection = {
  STREAMING: 'Streaming',
  AGENTIC: 'Agentic',
  PLATFORM: 'Platform',
} as const;

type SidebarSectionName = (typeof SidebarSection)[keyof typeof SidebarSection];

// NavLinkProps type compatible with @redpanda-data/ui Sidebar
type NavLinkProps = {
  title: string;
  to: string;
  // biome-ignore lint/suspicious/noExplicitAny: matches @redpanda-data/ui type
  icon: any;
  isDisabled?: boolean;
  disabledText?: string;
  group?: string;
};

// Sidebar item definition
export type SidebarItem = {
  path: string;
  title: string | ReactNode;
  icon?: LucideIcon | ((props: React.SVGProps<SVGSVGElement>) => JSX.Element);
  visibilityCheck?: () => MenuItemState;
  group: SidebarSectionName;
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
  // --- Streaming ---
  {
    path: '/overview',
    title: 'Overview',
    icon: HomeIcon,
    group: SidebarSection.STREAMING,
    visibilityCheck: routeVisibility(true),
  },
  {
    path: '/observability',
    title: 'Metrics',
    icon: ActivityIcon,
    group: SidebarSection.STREAMING,
    visibilityCheck: routeVisibility(
      () =>
        isEmbedded() &&
        (isServerless()
          ? isFeatureFlagEnabled('enableDataplaneObservabilityServerless')
          : isFeatureFlagEnabled('enableDataplaneObservability'))
    ),
  },
  {
    path: '/topics',
    title: 'Topics',
    icon: CollectionIcon,
    group: SidebarSection.STREAMING,
    visibilityCheck: routeVisibility(true),
  },
  {
    path: '/schema-registry',
    title: 'Schema Registry',
    icon: CubeIcon,
    group: SidebarSection.STREAMING,
    visibilityCheck: routeVisibility(true),
  },
  {
    path: '/groups',
    title: 'Consumer Groups',
    icon: FilterIcon,
    group: SidebarSection.STREAMING,
    visibilityCheck: routeVisibility(true, [Feature.ConsumerGroups]),
  },
  {
    path: '/security',
    title: 'Security',
    icon: ShieldCheckIcon,
    group: SidebarSection.STREAMING,
    visibilityCheck: routeVisibility(true),
  },
  {
    path: '/quotas',
    title: 'Quotas',
    icon: ScaleIcon,
    group: SidebarSection.STREAMING,
    visibilityCheck: routeVisibility(true, [Feature.GetQuotas], ['canListQuotas']),
  },
  {
    path: '/connect-clusters',
    title: 'Connect',
    icon: LinkIcon,
    group: SidebarSection.STREAMING,
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
    group: SidebarSection.STREAMING,
    visibilityCheck: routeVisibility(true, [Feature.TransformsService]),
  },
  {
    path: '/reassign-partitions',
    title: 'Reassign Partitions',
    icon: BeakerIcon,
    group: SidebarSection.STREAMING,
    visibilityCheck: routeVisibility(
      true,
      [Feature.GetReassignments, Feature.PatchReassignments],
      ['canPatchConfigs', 'canReassignPartitions'],
      ['REASSIGN_PARTITIONS']
    ),
  },
  {
    path: '/shadowlinks',
    title: 'Shadow Links',
    icon: ShieldIcon,
    group: SidebarSection.STREAMING,
    visibilityCheck: routeVisibility(() => {
      if (isEmbedded()) {
        return !isServerless();
      }
      return true;
    }),
  },
  // --- Agentic ---
  {
    path: '/mcp-servers',
    title: 'Remote MCP',
    icon: MCPIcon,
    group: SidebarSection.AGENTIC,
    visibilityCheck: routeVisibility(() => isEmbedded()),
  },
  {
    path: '/agents',
    title: 'AI Agents',
    icon: UserCircleIcon,
    group: SidebarSection.AGENTIC,
    visibilityCheck: routeVisibility(() => isEmbedded() && isAdpEnabled()),
  },
  {
    path: '/knowledgebases',
    title: 'Knowledge Bases',
    icon: BookOpenIcon,
    group: SidebarSection.AGENTIC,
    visibilityCheck: routeVisibility(
      () => isAdpEnabled() && isFeatureFlagEnabled('enableKnowledgeBaseInConsoleUi'),
      [Feature.PipelineService]
    ),
  },
  {
    path: '/transcripts',
    title: 'Transcripts',
    icon: ActivityIcon,
    group: SidebarSection.AGENTIC,
    visibilityCheck: routeVisibility(() => isEmbedded() && isAdpEnabled(), [Feature.TracingService]),
  },
  // --- Platform ---
  {
    path: '/secrets',
    title: 'Secrets Store',
    icon: KeyIcon,
    group: SidebarSection.PLATFORM,
    visibilityCheck: routeVisibility(() => isEmbedded(), [Feature.PipelineService]),
  },
];

// Routes that should be hidden in embedded mode
const routesIgnoredInEmbedded = ['/overview', '/reassign-partitions', '/admin'];

// Routes that should be hidden in serverless mode
const routesIgnoredInServerless = ['/overview', '/quotas', '/reassign-partitions', '/admin', '/transforms'];

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

  return {
    title: String(item.title),
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
 * Creates visible sidebar items for the legacy @redpanda-data/ui Sidebar.
 */
export function createVisibleSidebarItems(): NavLinkProps[] {
  return SIDEBAR_ITEMS.map(processSidebarItem).filter((item): item is NavLinkProps => item !== null);
}

export type SidebarGroupedItems = { group: string; items: NavLinkProps[] };

const SECTION_ORDER = [SidebarSection.STREAMING, SidebarSection.AGENTIC, SidebarSection.PLATFORM];

/**
 * Creates sidebar items grouped by section (Streaming, Agentic, Platform).
 * Filters invisible items and omits empty groups.
 */
export function createGroupedSidebarItems(): SidebarGroupedItems[] {
  const groupMap = new Map<string, NavLinkProps[]>();

  for (const section of SECTION_ORDER) {
    groupMap.set(section, []);
  }

  for (const item of SIDEBAR_ITEMS) {
    const processed = processSidebarItem(item);
    if (processed && item.group) {
      const list = groupMap.get(item.group);
      if (list) {
        list.push(processed);
      }
    }
  }

  return SECTION_ORDER.map((section) => ({
    group: section,
    items: groupMap.get(section) ?? [],
  })).filter((g) => g.items.length > 0);
}

/**
 * Get filtered routes for embedded mode.
 * Used by config.ts for embeddedAvailableRoutesObservable.
 */
export function getEmbeddedAvailableRoutes(): SidebarItem[] {
  return SIDEBAR_ITEMS.filter((x) => x.icon !== null && x.icon !== undefined) // Routes without icon are "nested"
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
