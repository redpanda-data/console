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

import type { LucideIcon } from 'lucide-react';
import { Database } from 'lucide-react';
import type { JSX, ReactNode, SVGProps } from 'react';

import { type AppFeature, AppFeatures } from './env';
import {
  ActivityIcon,
  AIIcon,
  BeakerIcon,
  CollectionIcon,
  CubeIcon,
  FilterIcon,
  HomeIcon,
  KeyIcon,
  LinkIcon,
  ScaleIcon,
  ShieldCheckIcon,
  ShieldIcon,
} from '../components/icons';
import { isEmbedded, isFeatureFlagEnabled, isServerless } from '../config';
import { api } from '../state/backend-api';
import { Feature, isSupported, shouldHideIfNotSupported } from '../state/supported-features';

const SidebarSection = {
  STREAMING: 'Streaming',
  PLATFORM: 'Platform',
} as const;

type SidebarSectionName = (typeof SidebarSection)[keyof typeof SidebarSection];

type SidebarItemIcon = LucideIcon | ((props: SVGProps<SVGSVGElement>) => JSX.Element);

type NavLinkProps = {
  title: string;
  to: string;
  icon: SidebarItemIcon;
  isDisabled?: boolean;
  disabledText?: string;
};

export type SidebarItem = {
  path: string;
  title: string | ReactNode;
  icon?: SidebarItemIcon;
  visibilityCheck?: () => MenuItemState;
  group: SidebarSectionName;
};

export type MenuItemState = {
  visible: boolean;
  disabledReasons: DisabledReason[];
};

const DisabledReasons = {
  notSupported: 0,
  noPermission: 1,
  enterpriseFeature: 2,
  notSupportedServerless: 3,
} as const;

type DisabledReason = (typeof DisabledReasons)[keyof typeof DisabledReasons];

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

function checkPermissions(permissions: UserPermissions[] | undefined) {
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

function checkAppFeatures(appFeatures: AppFeature[] | undefined) {
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

function routeVisibility(
  visible: boolean | (() => boolean),
  requiredFeatures?: Parameters<typeof isSupported>[0][],
  requiredPermissions?: UserPermissions[],
  requiredAppFeatures?: AppFeature[]
): () => MenuItemState {
  return () => {
    const isVisible = typeof visible === 'boolean' ? visible : visible();
    const [shouldHide, featureReason] = checkFeatureSupport(requiredFeatures);
    const disabledReasons = [
      featureReason,
      checkPermissions(requiredPermissions),
      checkAppFeatures(requiredAppFeatures),
    ].filter((reason): reason is DisabledReason => reason !== null);

    return { visible: !shouldHide && isVisible, disabledReasons };
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
    path: '/sql',
    title: 'SQL',
    icon: Database,
    group: SidebarSection.STREAMING,
    visibilityCheck: routeVisibility(true, [Feature.SQLService]),
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
  {
    path: '/secrets',
    title: 'Secrets Store',
    icon: KeyIcon,
    group: SidebarSection.PLATFORM,
    visibilityCheck: routeVisibility(() => isEmbedded(), [Feature.PipelineService]),
  },
];

const routesIgnoredInEmbedded = ['/overview', '/reassign-partitions', '/admin'];

const routesIgnoredInServerless = ['/overview', '/quotas', '/reassign-partitions', '/admin', '/transforms'];

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

function getDisabledText(reasons: DisabledReason[]) {
  const firstReason = reasons[0];
  if (firstReason === undefined) {
    return '';
  }
  const textMap: Record<DisabledReason, string> = {
    [DisabledReasons.noPermission]: "You don't have permissions to view this page.",
    [DisabledReasons.notSupported]: 'The Kafka cluster does not support this feature.',
    [DisabledReasons.enterpriseFeature]: 'This feature requires an enterprise license.',
    [DisabledReasons.notSupportedServerless]: 'This feature is not yet supported for Serverless.',
  };
  return textMap[firstReason];
}

export type SidebarGroupedItems = { group: string; items: NavLinkProps[] };

const SECTION_ORDER = [SidebarSection.STREAMING, SidebarSection.PLATFORM];

/**
 * Creates sidebar items grouped by section.
 * Filters invisible items and omits empty groups.
 */
export function createGroupedSidebarItems() {
  const groupMap = new Map<string, NavLinkProps[]>();

  for (const section of SECTION_ORDER) {
    groupMap.set(section, []);
  }

  for (const item of SIDEBAR_ITEMS) {
    const processed = processSidebarItem(item);
    if (processed) {
      groupMap.get(item.group)?.push(processed);
    }
  }

  const groups: SidebarGroupedItems[] = SECTION_ORDER.map((section) => ({
    group: section,
    items: groupMap.get(section) ?? [],
  })).filter((g) => g.items.length > 0);
  return groups;
}

/**
 * Get filtered routes for embedded mode.
 * Used by config.ts for embeddedAvailableRoutesObservable.
 *
 * Excludes nested items without sidebar icons as well as routes not exposed in the host.
 */
export function getEmbeddedAvailableRoutes() {
  return SIDEBAR_ITEMS.filter((x) => x.icon !== null && x.icon !== undefined)
    .filter((x) => !routesIgnoredInEmbedded.includes(x.path))
    .filter((x) => {
      if (x.visibilityCheck) {
        const state = x.visibilityCheck();
        return state.visible;
      }
      return true;
    })
    .filter((x) => !(isServerless() && routesIgnoredInServerless.includes(x.path)));
}

export type { MenuItemState as RouteMenuItemState };
