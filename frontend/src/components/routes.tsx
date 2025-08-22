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
} from '@heroicons/react/outline';
import type { NavLinkProps } from '@redpanda-data/ui/dist/components/Nav/NavLink';
import React, { Fragment, type FunctionComponent, useEffect } from 'react';
import { HiOutlinePuzzlePiece } from 'react-icons/hi2';
import { MdKey, MdOutlineSmartToy } from 'react-icons/md';
import { Navigate, Route, Routes, useLocation, useMatch, useParams } from 'react-router-dom';
import { appGlobal } from 'state/appGlobal';
import { isEmbedded, isFeatureFlagEnabled, isServerless } from '../config';
import { api } from '../state/backendApi';
import type { UserPermissions } from '../state/restInterfaces';
import { Feature, type FeatureEntry, isSupported, shouldHideIfNotSupported } from '../state/supportedFeatures';
import { uiState } from '../state/uiState';
import { AnimatePresence } from '../utils/animationProps';
import { type AppFeature, AppFeatures } from '../utils/env';
import { Section } from './misc/common';
import AclList, { type AclListTab } from './pages/acls/Acl.List';
import RoleCreatePage from './pages/acls/RoleCreate';
import RoleDetailsPage from './pages/acls/RoleDetails';
import RoleEditPage from './pages/acls/RoleEditPage';
import UserCreatePage from './pages/acls/UserCreate';
import UserDetailsPage from './pages/acls/UserDetails';
import { AdminDebugBundle } from './pages/admin/Admin.DebugBundle';
import AdminPageDebugBundleProgress from './pages/admin/Admin.DebugBundleProgress';
import LicenseExpiredPage from './pages/admin/LicenseExpiredPage';
import UploadLicensePage from './pages/admin/UploadLicensePage';
import { AgentListPage, getAgentSidebarItemTitle } from './pages/agents/agent-list-page';
import { CreateAgentPage } from './pages/agents/create/create-agent-page';
import { CreateAgentHTTP } from './pages/agents/create/templates/http/create-agent-http';
import { AgentDetailsPage } from './pages/agents/details/agent-details-page';
import KafkaClusterDetails from './pages/connect/Cluster.Details';
import KafkaConnectorDetails from './pages/connect/Connector.Details';
import CreateConnector from './pages/connect/CreateConnector';
import KafkaConnectOverview from './pages/connect/Overview';
import GroupDetails from './pages/consumers/Group.Details';
import GroupList from './pages/consumers/Group.List';
import KnowledgeBaseCreate from './pages/knowledgebase/KnowledgeBase.Create';
import KnowledgeBaseDetails from './pages/knowledgebase/KnowledgeBase.Details';
import KnowledgeBaseList from './pages/knowledgebase/KnowledgeBase.List';
import { BrokerDetails } from './pages/overview/Broker.Details';
import Overview from './pages/overview/Overview';
import type { PageComponentType, PageProps } from './pages/Page';
import QuotasList from './pages/quotas/Quotas.List';
import ReassignPartitions from './pages/reassign-partitions/ReassignPartitions';
import RpConnectPipelinesCreate from './pages/rp-connect/Pipelines.Create';
import RpConnectPipelinesDetails from './pages/rp-connect/Pipelines.Details';
import RpConnectPipelinesEdit from './pages/rp-connect/Pipelines.Edit';
import RpConnectSecretCreate from './pages/rp-connect/secrets/Secrets.Create';
import RpConnectSecretUpdate from './pages/rp-connect/secrets/Secrets.Update';
import EditSchemaCompatibilityPage from './pages/schemas/EditCompatibility';
import { SchemaAddVersionPage, SchemaCreatePage } from './pages/schemas/Schema.Create';
import SchemaDetailsView from './pages/schemas/Schema.Details';
import SchemaList from './pages/schemas/Schema.List';
import { SecretsStorePage } from './pages/secrets/secrets-store-page';
import TopicDetails from './pages/topics/Topic.Details';
import TopicList from './pages/topics/Topic.List';
import { TopicProducePage } from './pages/topics/Topic.Produce';
import TransformDetails from './pages/transforms/Transform.Details';
import TransformsList from './pages/transforms/Transforms.List';
import { TransformsSetup } from './pages/transforms/Transforms.Setup';

//
//	Route Types
//
export type IRouteEntry = PageDefinition<any>;

export interface PageDefinition<TRouteParams = {}> {
  title: string;
  path: string;
  pageType: PageComponentType<TRouteParams> | FunctionComponent<TRouteParams>;
  routeJsx: JSX.Element;
  icon?: (props: React.ComponentProps<'svg'>) => JSX.Element;
  menuItemKey?: string; // set by 'CreateRouteMenuItems'
  visibilityCheck?: () => MenuItemState;
}

// Generate content for <Menu> from all routes
export function createVisibleSidebarItems(entries: IRouteEntry[]): NavLinkProps[] {
  return entries
    .map((entry) => {
      // Menu entry for Page
      if (entry.path.includes(':')) return null; // only root-routes (no param) can be in menu
      if (!entry?.icon) return null; // items without icon do not appear in the sidebar

      let isEnabled = true;
      let disabledText: JSX.Element = <Fragment key={entry.title} />;
      if (entry.visibilityCheck) {
        const visibility = entry.visibilityCheck();
        if (!visibility.visible) return null;

        isEnabled = visibility.disabledReasons?.length === 0;
        if (!isEnabled) disabledText = disabledReasonText[visibility.disabledReasons?.[0]];
      }
      const isDisabled = !isEnabled;

      // Handle AI Agents and Knowledge Base routes with beta badge
      const title =
        entry.path === '/agents' || entry.path === '/knowledgebases'
          ? getAgentSidebarItemTitle({ route: entry })
          : entry.title;

      return {
        title: title as string | JSX.Element,
        to: entry.path as string,
        icon: entry.icon as any,
        isDisabled: isDisabled as boolean,
        disabledText: disabledText as unknown as string,
      };
    })
    .filter((x) => x != null && x !== undefined) as NavLinkProps[];
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
      <Route path="/" element={<Navigate to="/overview" replace />} />

      {/* Emit all <Route/> elements */}
      {EmitRouteViews(APP_ROUTES)}

      <Route path="*" element={<NotFound />} />
    </Routes>
  </AnimatePresence>
);

enum DisabledReasons {
  notSupported = 0, // kafka cluster version too low
  noPermission = 1, // user doesn't have permissions to use the feature,
  enterpriseFeature = 2,
  notSupportedServerless = 3, // This feature is not supported in serverless mode
}

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

interface MenuItemState {
  visible: boolean;
  disabledReasons: DisabledReasons[];
}

// Separate component to handle the route rendering logic
const RouteRenderer: FunctionComponent<{ route: PageDefinition<any> }> = ({ route }) => {
  const matchedPath = useMatch(route.path) ?? '';
  const params = useParams();

  const pageProps: PageProps = {
    matchedPath,
    ...params,
  } as PageProps;

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
      } as PageDefinition<any>;
    }
  }, [route.path, route.title, route.pageType, route.icon, route.visibilityCheck]);

  return <route.pageType key={route.path} {...pageProps} />;
};

/**
 * @description A higher-order-component using feature flags to check if it's possible to navigate to a given route.
 */
const ProtectedRoute: FunctionComponent<{ children: React.ReactNode; path: string }> = ({ children, path }) => {
  const isAgentFeatureEnabled = isFeatureFlagEnabled('enableAiAgentsInConsoleUi');
  const isKnowledgeBaseFeatureEnabled = isFeatureFlagEnabled('enableKnowledgeBaseInConsoleUi');
  const location = useLocation();

  useEffect(() => {
    if (!isAgentFeatureEnabled && path.includes('/agents') && location.pathname !== '/overview') {
      appGlobal.historyPush('/overview');
      window.location.reload(); // Required because we want to load Cloud UI's overview, not Console UI.
    }
    if (!isKnowledgeBaseFeatureEnabled && path.includes('/knowledgebases') && location.pathname !== '/overview') {
      appGlobal.historyPush('/overview');
      window.location.reload(); // Required because we want to load Cloud UI's overview, not Console UI.
    }
  }, [isAgentFeatureEnabled, isKnowledgeBaseFeatureEnabled, path, location.pathname]);

  return children;
};

function MakeRoute<TRouteParams>(
  path: string,
  page: PageComponentType<TRouteParams> | FunctionComponent<TRouteParams>,
  title: string,
  icon?: (props: React.ComponentProps<'svg'>) => JSX.Element,
  exact = true,
  showCallback?: () => MenuItemState,
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
      path={`${path}${exact ? '' : '/*'}`}
      key={path}
      element={
        <ProtectedRoute path={path}>
          <RouteRenderer route={route} />
        </ProtectedRoute>
      }
    />
  );
  route.routeJsx = routeElement;

  return route;
}

function routeVisibility(
  visible: boolean | (() => boolean),
  requiredFeatures?: FeatureEntry[],
  requiredPermissions?: UserPermissions[],
  requiredAppFeatures?: AppFeature[],
): () => MenuItemState {
  return () => {
    let v = typeof visible === 'boolean' ? visible : visible();

    const disabledReasons: DisabledReasons[] = [];
    if (requiredFeatures)
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

    if (requiredPermissions && api.userData)
      for (const p of requiredPermissions) {
        const hasPermission = api.userData[p];
        if (!hasPermission) {
          disabledReasons.push(DisabledReasons.noPermission);
          break;
        }
      }

    if (requiredAppFeatures) {
      for (const f of requiredAppFeatures)
        if (AppFeatures[f] === false) {
          disabledReasons.push(DisabledReasons.enterpriseFeature);
          break;
        }
    }

    return {
      visible: v,
      disabledReasons: disabledReasons,
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

  MakeRoute<{}>('/topics', TopicList, 'Topics', CollectionIcon),
  MakeRoute<{ topicName: string }>('/topics/:topicName', TopicDetails, 'Topics'),
  MakeRoute<{ topicName: string }>('/topics/:topicName/produce-record', TopicProducePage, 'Produce Record'),

  MakeRoute<{}>('/schema-registry', SchemaList, 'Schema Registry', CubeTransparentIcon),
  MakeRoute<{}>('/schema-registry/create', SchemaCreatePage, 'Create schema'),
  MakeRoute<{ subjectName: string }>(
    '/schema-registry/subjects/:subjectName/add-version',
    SchemaAddVersionPage,
    'Add version',
  ),
  MakeRoute<{ subjectName: string }>('/schema-registry/subjects/:subjectName', SchemaDetailsView, 'Schema Registry'),
  MakeRoute<{ subjectName: string }>(
    '/schema-registry/edit-compatibility',
    EditSchemaCompatibilityPage,
    'Edit Schema Compatibility',
  ),
  MakeRoute<{ subjectName: string }>(
    '/schema-registry/subjects/:subjectName/edit-compatibility',
    EditSchemaCompatibilityPage,
    'Edit Schema Compatibility',
  ),

  MakeRoute<{}>(
    '/groups',
    GroupList,
    'Consumer Groups',
    FilterIcon,
    undefined,
    routeVisibility(true, [Feature.ConsumerGroups]),
  ),
  MakeRoute<{ groupId: string }>('/groups/:groupId/', GroupDetails, 'Consumer Groups'),

  MakeRoute<{}>(
    '/secrets',
    SecretsStorePage,
    'Secrets Store',
    MdKey,
    true,
    routeVisibility(() => isEmbedded(), [Feature.PipelineService]), // If pipeline service is configured, then we assume secret service is also configured, and we are not self-hosted, so we can show the new route
  ),

  MakeRoute<{}>(
    '/agents',
    AgentListPage,
    'AI Agents',
    HiOutlinePuzzlePiece,
    true,
    routeVisibility(
      // Do not display agents if feature flag is disabled, or in self-hosted mode or when using Serverless console
      () => isEmbedded() && isFeatureFlagEnabled('enableAiAgentsInConsoleUi'), // Needed to pass flags to current routing solution
      [Feature.PipelineService],
      [],
      [],
    ),
  ),
  MakeRoute<{}>('/agents/create', CreateAgentPage, 'AI Agents', undefined, true, undefined),
  MakeRoute<{}>('/agents/create/http', CreateAgentHTTP, 'AI Agents', undefined, true, undefined),
  MakeRoute<{ agentId: string }>('/agents/:agentId', AgentDetailsPage, 'AI Agents', undefined, true, undefined),

  MakeRoute<{}>(
    '/knowledgebases',
    KnowledgeBaseList,
    'Knowledge Bases',
    BookOpenIcon,
    true,
    routeVisibility(
      // Do not display knowledge bases if feature flag is disabled
      () => isFeatureFlagEnabled('enableKnowledgeBaseInConsoleUi'), // Needed to pass flags to current routing solution
      [Feature.PipelineService],
      [],
      [],
    ),
  ),
  MakeRoute<{}>('/knowledgebases/create', KnowledgeBaseCreate, 'Create Knowledge Base'),
  MakeRoute<{ knowledgebaseId: string }>(
    '/knowledgebases/:knowledgebaseId',
    KnowledgeBaseDetails,
    'Knowledge Base Details',
  ),

  MakeRoute<{}>('/security', AclList, 'Security', ShieldCheckIcon, true),
  MakeRoute<{ tab: AclListTab }>('/security/:tab?', AclList, 'Security'),

  MakeRoute<{}>('/security/users/create', UserCreatePage, 'Security'),
  MakeRoute<{ userName: string }>('/security/users/:userName/details', UserDetailsPage, 'Security'),

  MakeRoute<{}>('/security/roles/create', RoleCreatePage, 'Security'),
  MakeRoute<{ roleName: string }>('/security/roles/:roleName/details', RoleDetailsPage, 'Security'),
  MakeRoute<{ roleName: string }>('/security/roles/:roleName/edit', RoleEditPage, 'Security'),

  MakeRoute<{}>(
    '/quotas',
    QuotasList,
    'Quotas',
    ScaleIcon,
    true,
    routeVisibility(true, [Feature.GetQuotas], ['canListQuotas']),
  ),

  MakeRoute<{ matchedPath: string }>('/connect-clusters', KafkaConnectOverview, 'Connect', LinkIcon, true, () => {
    if (isServerless()) {
      console.log('Connect clusters inside serverless checks.');
      // We are in serverless, there is no kafka connect, so we can ignore it.
      // Here, we only care about the pipeline service and use that to decide whether to show the entry
      if (isSupported(Feature.PipelineService)) {
        console.debug('Pipeline Service enabled. Showing sidebar link.');
        return { visible: true, disabledReasons: [] };
      }
      // Pipeline service is not active? Hide entry
      console.debug('Pipeline Service NOT enabled. NOT showing sidebar link.');
      return { visible: false, disabledReasons: [DisabledReasons.notSupported] };
    }
    // We are in cloud (dedicated or BYOC), or self-hosted
    // We always show the entry, if kafka connect is not enabled, the page will show a link to the documentation
    console.debug('Pipeline Service state does not matter. Showing sidebar link.');
    return { visible: true, disabledReasons: [] };
  }),
  MakeRoute<{ clusterName: string }>('/connect-clusters/:clusterName', KafkaClusterDetails, 'Connect Cluster'),
  MakeRoute<{ clusterName: string }>(
    '/connect-clusters/:clusterName/create-connector',
    CreateConnector,
    'Create Connector',
    undefined,
    undefined,
    routeVisibility(false),
  ),
  MakeRoute<{ clusterName: string; connector: string }>(
    '/connect-clusters/:clusterName/:connector',
    KafkaConnectorDetails,
    'Connector Details',
  ),

  MakeRoute<{}>(
    '/transforms-setup',
    TransformsSetup,
    'Transforms',
    undefined,
    true,
    routeVisibility(true, [Feature.TransformsService]),
  ),
  MakeRoute<{}>(
    '/transforms',
    TransformsList,
    'Transforms',
    MdOutlineSmartToy,
    true,
    routeVisibility(true, [Feature.TransformsService]),
  ),
  MakeRoute<{ transformName: string }>('/transforms/:transformName', TransformDetails, 'Transforms'),

  // MakeRoute<{}>('/rp-connect', RpConnectPipelinesList, 'Connectors', LinkIcon, true),
  MakeRoute<{}>('/rp-connect/secrets/create', RpConnectSecretCreate, 'Connector-Secrets'),
  MakeRoute<{}>('/rp-connect/create', RpConnectPipelinesCreate, 'Connectors'),
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
      ['REASSIGN_PARTITIONS'],
    ),
  ),

  MakeRoute<{}>(
    '/debug-bundle',
    AdminDebugBundle,
    'Debug Bundle',
    undefined,
    true,
    routeVisibility(false, [Feature.DebugBundleService], ['canViewDebugBundle']),
  ),
  MakeRoute<{}>(
    '/debug-bundle/progress/:jobId',
    AdminPageDebugBundleProgress,
    'Debug Bundle Progress',
    undefined,
    true,
    routeVisibility(false, [Feature.DebugBundleService], ['canViewDebugBundle']),
  ),

  MakeRoute<{}>(
    '/upload-license',
    UploadLicensePage,
    'Upload License',
    undefined,
    false,
    routeVisibility(() => api.isRedpanda && api.isAdminApiConfigured, [], ['canManageLicense']),
  ),

  MakeRoute<{}>('/trial-expired', LicenseExpiredPage, 'Your enterprise trial has expired'),
].filterNull();
