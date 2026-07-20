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

const DOCS_ROOT = 'https://docs.redpanda.com';

/**
 * Canonical links into docs.redpanda.com, grouped by docs section.
 * Every URL resolves directly (HTTP 200, no redirect) — verify that before
 * adding or changing an entry, since a broken docs link ships silently.
 */
export const docsLinks = {
  /** Redpanda Cloud (`/cloud-data-platform`) — pipelines and managed connectors. */
  cloud: {
    connectAbout: `${DOCS_ROOT}/cloud-data-platform/develop/connect/about/`,
    connectQuickstart: `${DOCS_ROOT}/cloud-data-platform/develop/connect/connect-quickstart/`,
    connectCookbooks: `${DOCS_ROOT}/cloud-data-platform/develop/connect/cookbooks/`,
    connectComponentCatalog: `${DOCS_ROOT}/cloud-data-platform/develop/connect/components/about/`,
    /** Base for per-component reference pages (no trailing slash), e.g. `${connectComponents}/inputs/kafka/`. */
    connectComponents: `${DOCS_ROOT}/cloud-data-platform/develop/connect/components`,
    managedConnectors: `${DOCS_ROOT}/cloud-data-platform/develop/managed-connectors/`,
    /** Setup guide for one managed connector, e.g. `managedConnectorGuide('create-mysql-source-connector')`. */
    managedConnectorGuide: (page: string) => `${DOCS_ROOT}/cloud-data-platform/develop/managed-connectors/${page}/`,
  },
  /** Platform-agnostic Redpanda Connect reference (`/connect`). */
  connect: {
    home: `${DOCS_ROOT}/connect/home/`,
    componentCatalog: `${DOCS_ROOT}/connect/components/about/`,
    cookbookCustomMetrics: `${DOCS_ROOT}/connect/cookbooks/custom_metrics/`,
    outputKafkaFranz: `${DOCS_ROOT}/connect/components/outputs/kafka_franz/`,
    redpandaComponent: `${DOCS_ROOT}/connect/components/redpanda/about/`,
  },
  /** Agentic Data Plane (`/agentic-data-plane`). */
  agentic: {
    monitor: `${DOCS_ROOT}/agentic-data-plane/monitor/`,
  },
  /** Self-Managed Redpanda and Console (`/streaming/current`). */
  selfManaged: {
    home: `${DOCS_ROOT}/streaming/current/home/`,
    rpkInstall: `${DOCS_ROOT}/streaming/current/get-started/rpk-install/`,
    console: `${DOCS_ROOT}/streaming/current/manage/console/`,
    consoleConfig: `${DOCS_ROOT}/streaming/current/console/config/configure-console/`,
    enterpriseEdition: `${DOCS_ROOT}/streaming/current/get-started/licensing/overview/#enterprise-edition`,
    rbac: `${DOCS_ROOT}/streaming/current/manage/security/authorization/rbac/`,
    acl: `${DOCS_ROOT}/streaming/current/manage/security/authorization/acl/`,
    scramAuthentication: `${DOCS_ROOT}/streaming/current/manage/kubernetes/security/authentication/k-authentication/#scram`,
    dataTransforms: `${DOCS_ROOT}/streaming/current/develop/data-transforms/how-transforms-work/`,
    dataTransformsBuild: `${DOCS_ROOT}/streaming/current/develop/data-transforms/build/`,
    shadowingNetworkSetup: `${DOCS_ROOT}/streaming/current/manage/disaster-recovery/shadowing/setup/#network-and-authentication`,
    shadowingReplicationPermissions: `${DOCS_ROOT}/streaming/current/manage/disaster-recovery/shadowing/setup/#replication-service-permissions`,
  },
} as const;
