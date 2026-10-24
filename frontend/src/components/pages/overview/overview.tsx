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

import { docsLinks } from 'utils/docs-links';

import { appGlobal } from '../../../state/app-global';
import { api } from '../../../state/backend-api';
import type { BrokerWithConfigAndStorage, ClusterOverview } from '../../../state/rest-interfaces';
import { DefaultSkeleton } from '../../../utils/tsx-utils';
import { prettyBytes, prettyBytesOrNA, titleCase } from '../../../utils/utils';
import PageContent from '../../misc/page-content';
import Section from '../../misc/section';
import { PageComponent, type PageInitHelper } from '../page';
import './Overview.scss';
import { Link } from '@tanstack/react-router';
import { AlertIcon, CheckIcon, CrownIcon, ErrorIcon } from 'components/icons';
import { Badge } from 'components/redpanda-ui/components/badge';
import { Button } from 'components/redpanda-ui/components/button';
import { DataTable, type DataTableColumnDef, type DataTableRow } from 'components/redpanda-ui/components/data-table';
import { SkeletonText } from 'components/redpanda-ui/components/skeleton';
import { Stat } from 'components/redpanda-ui/components/stat';
import { StatusDot } from 'components/redpanda-ui/components/status-dot';
import { Tooltip, TooltipContent, TooltipTrigger } from 'components/redpanda-ui/components/tooltip';
import React, { type FC, type ReactNode } from 'react';

import ClusterHealthOverview from './cluster-health-overview';
import { ShadowLinkSection } from './shadow-link-overview-card';
import { type ComponentStatus, StatusType } from '../../../protogen/redpanda/api/console/v1alpha1/cluster_status_pb';
import NurturePanel from '../../builder-io/nurture-panel';
import {
  getEnterpriseCTALink,
  isLicenseWithEnterpriseAccess,
  licensesToSimplifiedPreview,
} from '../../license/license-utils';
import { OverviewLicenseNotification } from '../../license/overview-license-notification';
import { NullFallbackBoundary } from '../../misc/null-fallback-boundary';
import { CompactSection } from '../shared/compact-section';
import { TonedIcon } from '../shared/toned-icon';

// Shared placeholder for any metric that isn't available (cluster unreachable,
// brokers not loaded, or backend simply didn't report a value).
const NOT_AVAILABLE = 'N/A';

const clusterStatusOf = (status?: StatusType) => {
  if (status === StatusType.HEALTHY) {
    return { displayText: 'Running', variant: 'success' as const };
  }
  if (status === StatusType.DEGRADED) {
    return { displayText: 'Degraded', variant: 'warning' as const };
  }
  return { displayText: 'Unhealthy', variant: 'destructive' as const };
};

const formatBrokersOnline = (online?: number, expected?: number) =>
  online === undefined || expected === undefined ? NOT_AVAILABLE : `${online} of ${expected}`;

const BrokerIdCell: FC<{ broker: BrokerWithConfigAndStorage }> = ({ broker }) => {
  const text = `${broker.brokerId}`;
  if (!broker.isController) {
    return text;
  }
  return (
    <div className="flex items-start gap-4">
      {text}
      <Tooltip>
        <TooltipTrigger
          render={
            <div>
              <TonedIcon icon={CrownIcon} size={16} tone="muted" />
            </div>
          }
        />
        <TooltipContent side="right">This broker is the current controller of the cluster</TooltipContent>
      </Tooltip>
    </div>
  );
};

class Overview extends PageComponent {
  initPage(p: PageInitHelper): void {
    p.title = 'Overview';
    p.addBreadcrumb('Overview', '/overview');

    this.refreshData(true);
    appGlobal.onRefresh = () => this.refreshData(true);
  }

  refreshData(force: boolean) {
    api.refreshCluster(force);
    api.refreshClusterOverview().catch(() => {
      // Error handling managed by API layer
    });

    api.refreshBrokers(force);
    api.refreshClusterHealth().catch(() => {
      // Error handling managed by API layer
    });
    api.refreshDebugBundleStatuses().catch(() => {
      // Error handling managed by API layer
    });
    api.listLicenses().catch(() => {
      // Error handling managed by API layer
    });
  }

  render() {
    if (!api.clusterOverview) {
      return DefaultSkeleton;
    }

    const overview = api.clusterOverview;
    const brokers = api.brokers ?? [];
    const clusterStatus = clusterStatusOf(overview.kafka?.status?.status);

    // On an unreachable cluster the brokers request fails and `api.brokers` stays
    // null forever, so there is no storage to report — fall back to the same N/A
    // placeholder as every other stat rather than a "..." that never resolves.
    const brokerSize =
      api.brokers && brokers.length > 0 ? prettyBytes(brokers.sum((x) => x.totalLogDirSizeBytes ?? 0)) : NOT_AVAILABLE;

    const version = overview.redpanda?.version ?? overview.kafka?.version ?? NOT_AVAILABLE;
    const brokersOnlineText = formatBrokersOnline(overview.kafka?.brokersOnline, overview.kafka?.brokersExpected);

    return (
      <div>
        <NullFallbackBoundary>
          <OverviewLicenseNotification />
        </NullFallbackBoundary>

        <PageContent className="overviewGrid">
          <div className="my-4">
            {/* Card padding (py-4) plus this row's py-1 keeps the stats band's 20px inset. */}
            <CompactSection>
              <div className="flex gap-8 py-1">
                <Stat
                  label="Cluster Status"
                  size="lg"
                  value={
                    <span className="inline-flex items-center gap-2">
                      <StatusDot size="sm" variant={clusterStatus.variant} />
                      {clusterStatus.displayText}
                    </span>
                  }
                />
                <Stat label="Cluster Storage Size" size="lg" value={brokerSize} />
                <Stat label="Cluster Version" size="lg" value={version} />
                <Stat label="Brokers Online" size="lg" value={brokersOnlineText} />
                <Stat label="Topics" size="lg" value={overview.kafka?.topicsCount ?? NOT_AVAILABLE} />
                <Stat label="Replicas" size="lg" value={overview.kafka?.replicasCount ?? NOT_AVAILABLE} />
              </div>
            </CompactSection>
          </div>

          {/* Shadow Link Overview Section */}
          <ShadowLinkSection />

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[fit-content(60%)_1fr]">
            <div className="flex flex-col gap-6">
              {api.clusterHealth?.isHealthy === false && (
                <CompactSection>
                  <h3>Cluster Health Debug</h3>
                  <ClusterHealthOverview />
                </CompactSection>
              )}

              <CompactSection>
                <h3>Broker Details</h3>
                <DataTable<BrokerWithConfigAndStorage>
                  columns={[
                    {
                      header: 'ID',
                      accessorKey: 'brokerId',
                      cell: ({ row: { original: broker } }) => <BrokerIdCell broker={broker} />,
                    },
                    {
                      id: 'status',
                      header: 'Status',
                      cell: ({ row: { original: broker } }) => (
                        <div className="flex gap-2">
                          {api.clusterHealth?.offlineBrokerIds.includes(broker.brokerId) ? (
                            <>
                              <TonedIcon icon={ErrorIcon} size={18} tone="destructive" />
                              Down
                            </>
                          ) : (
                            <>
                              <TonedIcon icon={CheckIcon} size={18} tone="success" />
                              Running
                            </>
                          )}
                        </div>
                      ),
                    },
                    {
                      header: 'Size',
                      accessorKey: 'totalLogDirSizeBytes',
                      cell: ({
                        row: {
                          original: { totalLogDirSizeBytes },
                        },
                      }) => (totalLogDirSizeBytes === undefined ? undefined : prettyBytesOrNA(totalLogDirSizeBytes)),
                    },
                    {
                      id: 'view',
                      header: '',
                      cell: ({ row: { original: broker } }) => (
                        <Button
                          onClick={() => appGlobal.historyPush(`/overview/${broker.brokerId}`)}
                          size="sm"
                          variant="ghost"
                        >
                          View
                        </Button>
                      ),
                    },
                    ...(api.brokers?.sum((b) => (b.rack ? 1 : 0))
                      ? [
                          {
                            id: 'rack',
                            header: 'Rack',
                            cell: ({ row: { original: broker } }: { row: DataTableRow<BrokerWithConfigAndStorage> }) =>
                              broker.rack,
                          } satisfies DataTableColumnDef<BrokerWithConfigAndStorage>,
                        ]
                      : []),
                  ]}
                  data={brokers}
                  // Legacy parity: ten a page, pager only past that.
                  pagination={brokers.length > 10}
                  sorting={false}
                />
              </CompactSection>

              <Section>
                <h3>Resources and updates</h3>
                {Boolean(api.clusterOverview?.kafka?.distribution) && <NurturePanel />}
                <hr className="mt-4 mb-2" />
                <div className="mt-4 flex flex-row items-center gap-2 text-subtle">
                  <a href={docsLinks.selfManaged.home}>Documentation</a>
                  <span className="mx-2 text-disabled">|</span>
                  <a href={docsLinks.selfManaged.rpkInstall}>CLI tools</a>
                </div>
              </Section>
            </div>

            <div>
              <CompactSection id="clusterDetails">
                <h3>Cluster Details</h3>

                <ClusterDetails />
              </CompactSection>
            </div>
          </div>
        </PageContent>
      </div>
    );
  }
}

export default Overview;

type DetailsBlockProps = { title: string; children?: React.ReactNode };

const DetailsBlock: FC<DetailsBlockProps> = ({ title, children }) => (
  <>
    <div className="col-span-1 lg:col-span-3">
      <h4 className="pb-1 text-body-sm font-semibold text-subtle uppercase">{title}</h4>
    </div>
    {children}
    {/* Hairline between blocks. */}
    <div className="col-span-1 my-4 h-px bg-border lg:col-span-3" />
  </>
);

type DetailsProps = { title: string; content: ([left?: React.ReactNode, right?: React.ReactNode] | undefined)[] };

const Details: FC<DetailsProps> = ({ title, content }) => {
  const [[firstLeft, firstRight] = [], ...rest] = content;
  return (
    <>
      <div>
        <h5 className="text-heading-sm">{title}</h5>
      </div>
      <div>{firstLeft}</div>
      <div>{firstRight}</div>

      {rest?.map((item) => (
        <React.Fragment key={`${String(item?.[0])}-${String(item?.[1])}`}>
          <div />
          <div>{item?.[0]}</div>
          <div>{item?.[1]}</div>
        </React.Fragment>
      ))}
    </>
  );
};

const formatStatus = (overviewStatus?: ComponentStatus): React.ReactNode => {
  if (!overviewStatus) {
    return null;
  }
  let status = <div>{titleCase(StatusType[overviewStatus.status])}</div>;
  if (overviewStatus.statusReason) {
    status = (
      <Tooltip>
        <TooltipTrigger render={status} />
        <TooltipContent>{overviewStatus.statusReason}</TooltipContent>
      </Tooltip>
    );
  }
  return status;
};

const kafkaConnectLines = (kafkaConnect: ClusterOverview['kafkaConnect']): DetailsProps['content'] => {
  const clusters = kafkaConnect?.clusters ?? [];
  if (kafkaConnect === null || clusters.length === 0) {
    return [['Not configured']];
  }
  return clusters.map((c) => [c.name, formatStatus(c.status)]);
};

// Without broker data, a "0 B" total would be wrong — report N/A instead.
const storageSummaryOf = (brokers: BrokerWithConfigAndStorage[] | null) => {
  const storageOrNA = (bytes: number) => (brokers == null ? NOT_AVAILABLE : prettyBytesOrNA(bytes));
  const brokerList = brokers ?? [];
  const totalStorageBytes = brokerList.sum((x) => x.totalLogDirSizeBytes ?? 0);
  const totalPrimaryStorageBytes = brokerList.sum((x) => x.totalPrimaryLogDirSizeBytes ?? 0);
  return {
    total: storageOrNA(totalStorageBytes),
    primary: storageOrNA(totalPrimaryStorageBytes),
    replicated: storageOrNA(totalStorageBytes - totalPrimaryStorageBytes),
  };
};

function ClusterDetails() {
  const overview = api.clusterOverview;
  const brokers = api.brokers;
  const licenses = api.licenses;

  // Only the cluster overview gates the skeleton. `brokers` can stay null on an
  // unreachable cluster (the request fails and never resolves), so waiting for it
  // would spin this panel forever — render what we have and mark the rest N/A.
  if (!overview) {
    return <SkeletonText className="mt-5" lines={13} width="full" />;
  }

  const storage = storageSummaryOf(brokers);
  const serviceAccounts = overview.redpanda?.userCount ?? 'Admin API not configured';

  const aclCount = overview.kafkaAuthorizerInfo
    ? overview.kafkaAuthorizerInfo.aclCount
    : (overview.kafkaAuthorizerError?.message ?? 'Authorizer not configured');

  return (
    <div className="grid w-full grid-cols-[auto] items-center gap-2 lg:grid-cols-[repeat(3,auto)]">
      <DetailsBlock title="Services">
        <Details content={kafkaConnectLines(overview.kafkaConnect)} title="Kafka Connect" />
        <Details
          content={
            overview.schemaRegistry === null
              ? [['Not configured']]
              : [
                  [
                    formatStatus(overview.schemaRegistry.status),
                    overview.schemaRegistry?.status?.status === StatusType.HEALTHY
                      ? `${overview.schemaRegistry.registeredSubjectsCount} schemas`
                      : undefined,
                  ],
                ]
          }
          title="Schema Registry"
        />
      </DetailsBlock>

      <DetailsBlock title="Storage">
        <Details content={[[storage.total]]} title="Total Bytes" />

        <Details content={[[storage.primary]]} title="Primary" />

        <Details content={[[storage.replicated]]} title="Replicated" />
      </DetailsBlock>

      <DetailsBlock title="Security">
        <Details
          content={[
            [
              <Link key={0} to="/security/users">
                {serviceAccounts}
              </Link>,
            ],
          ]}
          title="Service Accounts"
        />

        <Details
          content={[
            [
              <Link key={0} to="/security/permissions">
                {aclCount}
              </Link>,
            ],
          ]}
          title="ACLs"
        />
      </DetailsBlock>

      <Details
        content={
          api.licensesLoaded === 'failed'
            ? [
                [
                  <div className="flex items-center gap-1" key="error">
                    <TonedIcon icon={AlertIcon} size={16} tone="destructive" /> Failed to load license info
                  </div>,
                ],
              ]
            : [
                ...licensesToSimplifiedPreview(licenses).map(
                  ({ name, expiresAt, isExpired }) =>
                    [
                      <div data-testid="overview-license-name" key={0}>
                        {name}
                      </div>,
                      expiresAt.length > 0 ? `(${isExpired ? 'expired' : 'expiring'} ${expiresAt})` : '',
                    ] as [left: ReactNode, right: ReactNode]
                ),
              ]
        }
        title="Licensing"
      />

      {api.licensesLoaded === 'loaded' && !api.licenses.some(isLicenseWithEnterpriseAccess) && (
        <>
          <div />
          <div className="col-span-1 lg:col-span-2">
            <a href={getEnterpriseCTALink('tryEnterprise')} rel="noopener noreferrer" target="_blank">
              <Badge tone="informative" variant="solid">
                <span className="underline">Redpanda Enterprise trial available</span>
              </Badge>
            </a>
          </div>
        </>
      )}

      {Boolean(api.isRedpanda && api.isAdminApiConfigured && api.userData?.canManageLicense) && (
        <>
          <div />
          <div className="col-span-1 lg:col-span-2">
            <Link to="/upload-license">Upload new license</Link>
          </div>
        </>
      )}
    </div>
  );
}
