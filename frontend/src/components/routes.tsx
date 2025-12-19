/**
 * Copyright 2022 Redpanda Data, Inc.
 *
 * Use of this software is governed by the Business Source License
 * included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
 *
 * As of the Change Date specified in that file, in accordance with
 * the Business Source License, use of this software will be governed
 * by the Apache License, Version 2.0
 */

// biome-ignore-all lint/complexity/noBannedTypes: empty object represents pages with no route params

import {
  BeakerIcon,
  BookOpenIcon,
  CollectionIcon,
  CubeTransparentIcon,
  FilterIcon,
  HomeIcon,
  LinkIcon,
  ScaleIcon,
  ShieldCheckIcon,
  UserCircleIcon,
} from '@heroicons/react/outline';
import type { NavLinkProps } from '@redpanda-data/ui/dist/components/Nav/NavLink';
import { Shield } from 'lucide-react';
import { NuqsAdapter } from 'nuqs/adapters/react-router/v6';
import React, { Fragment, type FunctionComponent, useEffect } from 'react';
import { MdKey, MdOutlineSmartToy } from 'react-icons/md';
import { Navigate, Route, Routes, useLocation, useMatch, useParams } from 'react-router-dom';
import { appGlobal } from 'state/app-global';

import { Section } from './misc/common';
import AclList, { type AclListTab } from './pages/acls/acl-list';
import AclCreatePage from './pages/acls/new-acl/acl-create-page';
import AclDetailPage from './pages/acls/new-acl/acl-detail-page';
import AclUpdatePage from './pages/acls/new-acl/acl-update-page';
import UserCreatePage from './pages/acls/user-create';
import UserDetailsPage from './pages/acls/user-details';
import { AdminDebugBundle } from './pages/admin/admin-debug-bundle';
import AdminPageDebugBundleProgress from './pages/admin/admin-debug-bundle-progress';
import LicenseExpiredPage from './pages/admin/license-expired-page';
import UploadLicensePage from './pages/admin/upload-license-page';
import { AIAgentCreatePage } from './pages/agents/create/ai-agent-create-page';
import { AIAgentDetailsPage } from './pages/agents/details/ai-agent-details-page';
import { AIAgentsListPage } from './pages/agents/list/ai-agent-list-page';
import KafkaClusterDetails from './pages/connect/cluster-details';
import KafkaConnectorDetails from './pages/connect/connector-details';
import CreateConnector from './pages/connect/create-connector';
import KafkaConnectOverview from './pages/connect/overview';
import GroupDetails from './pages/consumers/group-details';
import GroupList from './pages/consumers/group-list';
import { KnowledgeBaseCreatePage } from './pages/knowledgebase/create/knowledge-base-create-page';
import { KnowledgeBaseDetailsPage } from './pages/knowledgebase/details/knowledge-base-details-page';
import { KnowledgeBaseDocumentDetailsPage } from './pages/knowledgebase/details/knowledge-base-document-details-page';
import { KnowledgeBaseListPage } from './pages/knowledgebase/list/knowledge-base-list-page';
import { RemoteMCPCreatePage } from './pages/mcp-servers/create/remote-mcp-create-page';
import { RemoteMCPDetailsPage } from './pages/mcp-servers/details/remote-mcp-details-page';
import { RemoteMCPListPage } from './pages/mcp-servers/list/remote-mcp-list-page';
import { APIConnectWizard } from './pages/overview/api-connect-wizard';
import { BrokerDetails } from './pages/overview/broker-details';
import Overview from './pages/overview/overview';
import type { PageComponentType, PageProps } from './pages/page';
import QuotasList from './pages/quotas/quotas-list';
import ReassignPartitions from './pages/reassign-partitions/reassign-partitions';
import RoleCreatePage from './pages/roles/role-create-page';
import RoleDetailPage from './pages/roles/role-detail-page';
import RoleUpdatePage from './pages/roles/role-update-page';
import { ConnectOnboardingWizard } from './pages/rp-connect/onboarding/onboarding-wizard';
import RpConnectPipelinesCreate from './pages/rp-connect/pipelines-create';
import RpConnectPipelinesDetails from './pages/rp-connect/pipelines-details';
import RpConnectPipelinesEdit from './pages/rp-connect/pipelines-edit';
import RpConnectSecretCreate from './pages/rp-connect/secrets/secrets-create';
import RpConnectSecretUpdate from './pages/rp-connect/secrets/secrets-update';
import EditSchemaCompatibilityPage from './pages/schemas/edit-compatibility';
import { SchemaAddVersionPage, SchemaCreatePage } from './pages/schemas/schema-create';
import SchemaDetailsView from './pages/schemas/schema-details';
import SchemaList from './pages/schemas/schema-list';
import { SecretCreatePage } from './pages/secrets-store/create/secret-create-page';
import { SecretEditPage } from './pages/secrets-store/edit/secret-edit-page';
import { SecretsStoreListPage } from './pages/secrets-store/secrets-store-list-page';
import { ShadowLinkCreatePage } from './pages/shadowlinks/create/shadowlink-create-page';
import { ShadowLinkDetailsPage } from './pages/shadowlinks/details/shadowlink-details-page';
import { ShadowLinkEditPage } from './pages/shadowlinks/edit/shadowlink-edit-page';
import { ShadowLinkListPage } from './pages/shadowlinks/list/shadowlink-list-page';
import TopicDetails from './pages/topics/topic-details';
import TopicList from './pages/topics/topic-list';
import { TopicProducePage } from './pages/topics/topic-produce';
import TransformDetails from './pages/transforms/transform-details';
import TransformsList from './pages/transforms/transforms-list';
import { TransformsSetup } from './pages/transforms/transforms-setup';
import { MCPIcon } from './redpanda-ui/components/icons';
import { getSidebarItemTitleWithBetaBadge } from './sidebar-utils';
import { isEmbedded, isFeatureFlagEnabled, isServerless } from '../config';
import { api } from '../state/backend-api';
import type { UserPermissions } from '../state/rest-interfaces';
import { Feature, type FeatureEntry, isSupported, shouldHideIfNotSupported } from '../state/supported-features';
import { uiState } from '../state/ui-state';
import { AnimatePresence } from '../utils/animation-props';
import { type AppFeature, AppFeatures } from '../utils/env';

//
//	Route Types
//
// biome-ignore lint/suspicious/noExplicitAny: route definitions have varying type parameters
export type IRouteEntry = PageDefinition<any>;
export type PageDefinition<TRouteParams = {}> = {
  title: string;
  path: string;
  pageType: PageComponentType<TRouteParams> | FunctionComponent<TRouteParams>;
  routeJsx: JSX.Element;
  icon?: (props: React.ComponentProps<'svg'>) => JSX.Element;
  menuItemKey?: string; // set by 'CreateRouteMenuItems'
  visibilityCheck?: () => MenuItemState;
};

// Generate content for <Menu> from all routes
export function createVisibleSidebarItems(entries: IRouteEntry[]): NavLinkProps[] {
  return entries
    .map((entry) => {
      // Menu entry for Page
      if (entry.path.includes(':')) {
        return null; // only root-routes (no param) can be in menu
      }
      if (!entry?.icon) {
        return null; // items without icon do not appear in the sidebar
      }

      let isEnabled = true;
      let disabledText: JSX.Element = <Fragment key={entry.title} />;
      if (entry.visibilityCheck) {
        const visibility = entry.visibilityCheck();
        if (!visibility.visible) {
          return null;
        }

        isEnabled = visibility.disabledReasons?.length === 0;
        if (!isEnabled) {
          disabledText = disabledReasonText[visibility.disabledReasons?.[0]];
        }
      }
      const isDisabled = !isEnabled;

      // Handle Knowledge Base and AI Agent routes with beta badge
      const title =
        entry.path === '/knowledgebases' || entry.path === '/agents'
          ? getSidebarItemTitleWithBetaBadge({ route: entry })
          : entry.title;

      return {
        title: title as string | JSX.Element,
        to: entry.path as string,
        icon: entry.icon as ((props: React.ComponentProps<'svg'>) => JSX.Element) | undefined,
        isDisabled: isDisabled as boolean,
        disabledText: disabledText as unknown as string,
      };
    })
    .filter((x) => x !== null && x !== undefined) as NavLinkProps[];
}

// Convert routes to <Route/> JSX declarations
function EmitRouteViews(entries: IRouteEntry[]): JSX.Element[] {
  return entries.map((e) => e.routeJsx);
}

const NotFound = () => {
  uiState.pageTitle = '404';
  const location = useLocation();
  return (
    <Section title="404">
      <div>
        <h4>Path:</h4> <span>{location.pathname}</span>
      </div>
      <div>
        <h4>Query:</h4> <pre>{JSON.stringify(location.search, null, 4)}</pre>
      </div>
    </Section>
  );
};

export const RouteView = () => (
  <AnimatePresence mode="wait">
    <Routes>
      {/* Index */}
      <Route element={<Navigate replace to="/overview" />} path="/" />

      {/* Emit all <Route/> elements */}
      {EmitRouteViews(APP_ROUTES)}

      <Route element={<NotFound />} path="*" />
    </Routes>
  </AnimatePresence>
);

const DisabledReasons = {
  notSupported: 0, // kafka cluster version too low
  noPermission: 1, // user doesn't have permissions to use the feature,
  enterpriseFeature: 2,
  notSupportedServerless: 3, // This feature is not supported in serverless mode
} as const;

type DisabledReasons = (typeof DisabledReasons)[keyof typeof DisabledReasons];

const disabledReasonText: { [key in DisabledReasons]: JSX.Element } = {
  [DisabledReasons.noPermission]: (
    <span>
      You don't have permissions
      <br />
      to view this page.
    </span>
  ),
  [DisabledReasons.notSupported]: (
    <span>
      The Kafka cluster does not
      <br />
      support this feature.
    </span>
  ),
  [DisabledReasons.enterpriseFeature]: <span>This feature requires an enterprise license.</span>,
  [DisabledReasons.notSupportedServerless]: <span>This feature is not yet supported for Serverless.</span>,
} as const;

export type MenuItemState = {
  visible: boolean;
  disabledReasons: DisabledReasons[];
};

// Separate component to handle the route rendering logic
function RouteRenderer<TRouteParams>({ route }: { route: PageDefinition<TRouteParams> }): JSX.Element {
  const matchedPath = useMatch(route.path) ?? '';
  const params = useParams();

  const pageProps = {
    matchedPath,
    ...params,
  } as PageProps<TRouteParams>;

  useEffect(() => {
    // Only update if we haven't already and the path has changed
    if (uiState.currentRoute?.path !== route.path) {
      // assign router without the routeJsx, otherwise it will cause MobX to overflow callstack
      uiState.currentRoute = {
        title: route.title,
        path: route.path,
        pageType: route.pageType,
        icon: route.icon,
        visibilityCheck: route.visibilityCheck,
        routeJsx: null as unknown as JSX.Element,
      } as PageDefinition<Record<string, never>>;
    }
  }, [route.path, route.title, route.pageType, route.icon, route.visibilityCheck]);

  return <route.pageType key={route.path} {...pageProps} />;
}

/**
 * @description A higher-order-component using feature flags to check if it's possible to navigate to a given route.
 */
const ProtectedRoute: FunctionComponent<{ children: React.ReactNode; path: string }> = ({ children, path }) => {
  const isKnowledgeBaseFeatureEnabled = isFeatureFlagEnabled('enableKnowledgeBaseInConsoleUi');
  const isRemoteMcpFeatureEnabled = isFeatureFlagEnabled('enableRemoteMcpInConsole');
  const location = useLocation();

  useEffect(() => {
    if (!isKnowledgeBaseFeatureEnabled && path.includes('/knowledgebases') && location.pathname !== '/overview') {
      appGlobal.historyPush('/overview');
      window.location.reload(); // Required because we want to load Cloud UI's overview, not Console UI.
    }
    if (!isRemoteMcpFeatureEnabled && path.includes('/mcp-servers') && location.pathname !== '/overview') {
      appGlobal.historyPush('/overview');
      window.location.reload(); // Required because we want to load Cloud UI's overview, not Console UI.
    }
    // enableRpcnTiles /wizard route
    if (
      !isFeatureFlagEnabled('enableRpcnTiles') &&
      path.includes('/rp-connect/wizard') &&
      location.pathname !== '/overview'
    ) {
      appGlobal.historyPush('/overview');
      window.location.reload(); // Required because we want to load Cloud UI's overview, not Console UI.
    }
    if (
      !isFeatureFlagEnabled('enableServerlessOnboardingWizard') &&
      path.includes('/get-started/api') &&
      location.pathname !== '/overview'
    ) {
      appGlobal.historyPush('/overview');
      window.location.reload(); // Required because we want to load Cloud UI's overview, not Console UI.
    }
  }, [isKnowledgeBaseFeatureEnabled, isRemoteMcpFeatureEnabled, path, location.pathname]);

  return children;
};

// biome-ignore lint/nursery/useMaxParams: legacy routing function, refactoring would require extensive changes
function MakeRoute<TRouteParams>(
  path: string,
  page: PageComponentType<TRouteParams> | FunctionComponent<TRouteParams>,
  title: string,
  icon?: (props: React.ComponentProps<'svg'>) => JSX.Element,
  exact = true,
  showCallback?: () => MenuItemState
): PageDefinition<TRouteParams> {
  const route: PageDefinition<TRouteParams> = {
    title,
    path,
    pageType: page,
    icon,
    visibilityCheck: showCallback,
    routeJsx: null as unknown as JSX.Element,
  };

  // Create the route element after routeData is defined
  const routeElement = (
    <Route
      element={
        <ProtectedRoute path={path}>
          <NuqsAdapter>
            <RouteRenderer route={route} />
          </NuqsAdapter>
        </ProtectedRoute>
      }
      key={path}
      path={`${path}${exact ? '' : '/*'}`}
    />
  );
  route.routeJsx = routeElement;

  return route;
}

function routeVisibility(
  visible: boolean | (() => boolean),
  requiredFeatures?: FeatureEntry[],
  requiredPermissions?: UserPermissions[],
  requiredAppFeatures?: AppFeature[]
): () => MenuItemState {
  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: route configuration with conditional rendering and permissions
  return () => {
    let v = typeof visible === 'boolean' ? visible : visible();

    const disabledReasons: DisabledReasons[] = [];
    if (requiredFeatures) {
      for (const f of requiredFeatures) {
        if (!isSupported(f)) {
          if (shouldHideIfNotSupported(f)) {
            v = false;
          } else {
            disabledReasons.push(DisabledReasons.notSupported);
          }
          break;
        }
      }
    }

    if (requiredPermissions && api.userData) {
      for (const p of requiredPermissions) {
        const hasPermission = api.userData[p];
        if (!hasPermission) {
          disabledReasons.push(DisabledReasons.noPermission);
          break;
        }
      }
    }

    if (requiredAppFeatures) {
      for (const f of requiredAppFeatures) {
        if (AppFeatures[f] === false) {
          disabledReasons.push(DisabledReasons.enterpriseFeature);
          break;
        }
      }
    }

    return {
      visible: v,
      disabledReasons,
    };
  };
}

//
// Route Definitions
// If a route has one or more parameters it will not be shown in the main menu (obviously, since the parameter would have to be known!)
//
export const APP_ROUTES: IRouteEntry[] = [
  MakeRoute<{}>('/overview', Overview, 'Overview', HomeIcon),
  MakeRoute<{ brokerId: string }>('/overview/:brokerId', BrokerDetails, 'Broker Details'),
  MakeRoute<{}>(
    '/get-started/api',
    APIConnectWizard,
    'Getting Started with API',
    undefined,
    undefined,
    routeVisibility(() => isServerless() && isFeatureFlagEnabled('enableServerlessOnboardingWizard'))
  ),

  MakeRoute<{}>('/topics', TopicList, 'Topics', CollectionIcon),
  MakeRoute<{ topicName: string }>('/topics/:topicName', TopicDetails, 'Topics'),
  MakeRoute<{ topicName: string }>('/topics/:topicName/produce-record', TopicProducePage, 'Produce Record'),

  MakeRoute<{}>('/schema-registry', SchemaList, 'Schema Registry', CubeTransparentIcon),
  MakeRoute<{}>('/schema-registry/create', SchemaCreatePage, 'Create schema'),
  MakeRoute<{ subjectName: string }>(
    '/schema-registry/subjects/:subjectName/add-version',
    SchemaAddVersionPage,
    'Add version'
  ),
  MakeRoute<{ subjectName: string }>('/schema-registry/subjects/:subjectName', SchemaDetailsView, 'Schema Registry'),
  MakeRoute<{ subjectName?: string }>(
    '/schema-registry/edit-compatibility',
    EditSchemaCompatibilityPage,
    'Edit Schema Compatibility'
  ),
  MakeRoute<{ subjectName?: string }>(
    '/schema-registry/subjects/:subjectName/edit-compatibility',
    EditSchemaCompatibilityPage,
    'Edit Schema Compatibility'
  ),

  MakeRoute<{}>(
    '/groups',
    GroupList,
    'Consumer Groups',
    FilterIcon,
    undefined,
    routeVisibility(true, [Feature.ConsumerGroups])
  ),
  MakeRoute<{ groupId: string }>('/groups/:groupId/', GroupDetails, 'Consumer Groups'),

  MakeRoute<{}>(
    '/secrets',
    SecretsStoreListPage,
    'Secrets Store',
    MdKey,
    true,
    routeVisibility(() => isEmbedded(), [Feature.PipelineService]) // If pipeline service is configured, then we assume secret service is also configured, and we are not self-hosted, so we can show the new route
  ),
  MakeRoute<{}>(
    '/secrets/create',
    SecretCreatePage,
    'Create Secret',
    undefined,
    true,
    routeVisibility(() => isEmbedded(), [Feature.PipelineService])
  ),
  MakeRoute<{ id: string }>(
    '/secrets/:id/edit',
    SecretEditPage,
    'Edit Secret',
    undefined,
    true,
    routeVisibility(() => isEmbedded(), [Feature.PipelineService])
  ),

  MakeRoute<{}>(
    '/knowledgebases',
    KnowledgeBaseListPage,
    'Knowledge Bases',
    BookOpenIcon,
    true,
    routeVisibility(
      // Do not display knowledge bases if feature flag is disabled
      () => isFeatureFlagEnabled('enableKnowledgeBaseInConsoleUi'), // Needed to pass flags to current routing solution
      [Feature.PipelineService],
      [],
      []
    )
  ),
  MakeRoute<{}>('/knowledgebases/create', KnowledgeBaseCreatePage, 'Create Knowledge Base'),
  MakeRoute<{ knowledgebaseId: string; documentId: string }>(
    '/knowledgebases/:knowledgebaseId/documents/:documentId',
    KnowledgeBaseDocumentDetailsPage,
    'Document Details'
  ),
  MakeRoute<{ knowledgebaseId: string }>(
    '/knowledgebases/:knowledgebaseId',
    KnowledgeBaseDetailsPage,
    'Knowledge Base Details'
  ),

  MakeRoute<{}>('/security', AclList, 'Security', ShieldCheckIcon, true),
  MakeRoute<{ tab?: AclListTab }>('/security/:tab?', AclList, 'Security'),

  MakeRoute<{}>('/security/acls/create', AclCreatePage, 'Create ACL'),
  MakeRoute<{}>('/security/acls/:aclName/update', AclUpdatePage, 'Update ACL'),
  MakeRoute<{}>('/security/acls/:aclName/details', AclDetailPage, 'ACL details'),

  MakeRoute<{}>('/security/users/create', UserCreatePage, 'Security'),
  MakeRoute<{ userName: string }>('/security/users/:userName/details', UserDetailsPage, 'Security'),

  MakeRoute<{}>('/security/roles/create', RoleCreatePage, 'Security'),
  MakeRoute<{ roleName: string }>('/security/roles/:roleName/details', RoleDetailPage, 'Security'),
  MakeRoute<{ roleName: string }>('/security/roles/:roleName/update', RoleUpdatePage, 'Security'),

  MakeRoute<{}>(
    '/quotas',
    QuotasList,
    'Quotas',
    ScaleIcon,
    true,
    routeVisibility(true, [Feature.GetQuotas], ['canListQuotas'])
  ),

  MakeRoute<{ matchedPath: string }>('/connect-clusters', KafkaConnectOverview, 'Connect', LinkIcon, true, () => {
    if (isServerless()) {
      // We are in serverless, there is no kafka connect, so we can ignore it.
      // Here, we only care about the pipeline service and use that to decide whether to show the entry
      if (isSupported(Feature.PipelineService)) {
        return { visible: true, disabledReasons: [] };
      }
      return { visible: false, disabledReasons: [DisabledReasons.notSupported] };
    }
    return { visible: true, disabledReasons: [] };
  }),
  MakeRoute<{ clusterName: string }>('/connect-clusters/:clusterName', KafkaClusterDetails, 'Connect Cluster'),
  MakeRoute<{ clusterName: string }>(
    '/connect-clusters/:clusterName/create-connector',
    CreateConnector,
    'Create Connector',
    undefined,
    undefined,
    routeVisibility(false)
  ),
  MakeRoute<{ clusterName: string; connector: string }>(
    '/connect-clusters/:clusterName/:connector',
    KafkaConnectorDetails,
    'Connector Details'
  ),

  MakeRoute<{}>(
    '/transforms-setup',
    TransformsSetup,
    'Transforms',
    undefined,
    true,
    routeVisibility(true, [Feature.TransformsService])
  ),
  MakeRoute<{}>(
    '/transforms',
    TransformsList,
    'Transforms',
    MdOutlineSmartToy,
    true,
    routeVisibility(true, [Feature.TransformsService])
  ),
  MakeRoute<{ transformName: string }>('/transforms/:transformName', TransformDetails, 'Transforms'),

  // MakeRoute<{}>('/rp-connect', RpConnectPipelinesList, 'Connectors', LinkIcon, true),
  MakeRoute<{}>('/rp-connect/secrets/create', RpConnectSecretCreate, 'Connector-Secrets'),
  MakeRoute<{}>('/rp-connect/create', RpConnectPipelinesCreate, 'Connectors'),
  MakeRoute<{}>(
    '/rp-connect/wizard',
    ConnectOnboardingWizard,
    'Connectors',
    undefined,
    undefined,
    routeVisibility(() => isFeatureFlagEnabled('enableRpcnTiles') && isEmbedded())
  ),
  MakeRoute<{ pipelineId: string }>('/rp-connect/:pipelineId', RpConnectPipelinesDetails, 'Connectors'),
  MakeRoute<{ pipelineId: string }>('/rp-connect/:pipelineId/edit', RpConnectPipelinesEdit, 'Connectors'),
  MakeRoute<{ secretId: string }>('/rp-connect/secrets/:secretId/edit', RpConnectSecretUpdate, 'Connector-Secrets'),

  MakeRoute<{}>(
    '/reassign-partitions',
    ReassignPartitions,
    'Reassign Partitions',
    BeakerIcon,
    false,
    routeVisibility(
      true,
      [Feature.GetReassignments, Feature.PatchReassignments],
      ['canPatchConfigs', 'canReassignPartitions'],
      ['REASSIGN_PARTITIONS']
    )
  ),

  MakeRoute<{}>(
    '/debug-bundle',
    AdminDebugBundle,
    'Debug Bundle',
    undefined,
    true,
    routeVisibility(false, [Feature.DebugBundleService], ['canViewDebugBundle'])
  ),
  MakeRoute<{}>(
    '/debug-bundle/progress/:jobId',
    AdminPageDebugBundleProgress,
    'Debug Bundle Progress',
    undefined,
    true,
    routeVisibility(false, [Feature.DebugBundleService], ['canViewDebugBundle'])
  ),

  MakeRoute<{}>(
    '/upload-license',
    UploadLicensePage,
    'Upload License',
    undefined,
    false,
    routeVisibility(() => api.isRedpanda && api.isAdminApiConfigured, [], ['canManageLicense'])
  ),

  MakeRoute<{}>('/trial-expired', LicenseExpiredPage, 'Your enterprise trial has expired'),

  MakeRoute<{}>(
    '/mcp-servers',
    RemoteMCPListPage,
    'Remote MCP',
    MCPIcon,
    true,
    routeVisibility(() => isEmbedded() && isFeatureFlagEnabled('enableRemoteMcpInConsole')) // show only in embedded mode with feature flag
  ),
  MakeRoute<{}>('/mcp-servers/create', RemoteMCPCreatePage, 'Create Remote MCP Server'),
  MakeRoute<{ id: string }>('/mcp-servers/:id', RemoteMCPDetailsPage, 'Remote MCP Details'),

  MakeRoute<{}>(
    '/shadowlinks',
    ShadowLinkListPage,
    'Shadow Links',
    (props) => <Shield {...props} />,
    true,
    routeVisibility(() => {
      if (isEmbedded()) {
        return isFeatureFlagEnabled('shadowlinkCloudUi');
      }
      return true;
    })
  ),
  MakeRoute<{}>('/shadowlinks/create', ShadowLinkCreatePage, 'Create Shadow Link'),
  MakeRoute<{ name: string }>('/shadowlinks/:name/edit', ShadowLinkEditPage, 'Edit Shadow Link'),
  MakeRoute<{ name: string }>('/shadowlinks/:name', ShadowLinkDetailsPage, 'Shadow Link Details'),

  MakeRoute<{}>(
    '/agents',
    AIAgentsListPage,
    'AI Agents',
    UserCircleIcon,
    true,
    routeVisibility(
      () =>
        isEmbedded() &&
        (!isServerless() || isFeatureFlagEnabled('enableAiAgentsInConsoleServerless')) && // we can override the isServerless check with a feature flag
        isFeatureFlagEnabled('enableAiAgentsInConsole')
    ) // show only in embedded mode with feature flag
  ),
  MakeRoute<{}>('/agents/create', AIAgentCreatePage, 'Create AI Agent'),
  MakeRoute<{ id: string }>('/agents/:id', AIAgentDetailsPage, 'AI Agent Details'),
].filterNull();
