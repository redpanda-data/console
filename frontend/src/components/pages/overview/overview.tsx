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

import { computed, makeObservable } from 'mobx';
import { observer } from 'mobx-react';

import { appGlobal } from '../../../state/app-global';
import { api } from '../../../state/backend-api';
import type { BrokerWithConfigAndStorage } from '../../../state/rest-interfaces';
import { DefaultSkeleton } from '../../../utils/tsx-utils';
import { prettyBytes, prettyBytesOrNA, titleCase } from '../../../utils/utils';
import PageContent from '../../misc/page-content';
import Section from '../../misc/section';
import { PageComponent, type PageInitHelper } from '../page';
import './Overview.scss';
import {
  Badge,
  Box,
  Button,
  DataTable,
  Flex,
  Grid,
  GridItem,
  Heading,
  Skeleton,
  Text,
  Tooltip,
} from '@redpanda-data/ui';
import { Link } from '@tanstack/react-router';
import type { Row } from '@tanstack/react-table';
import { AlertIcon, CheckIcon, CrownIcon, ErrorIcon } from 'components/icons';
import React, { type FC, type ReactNode } from 'react';

import ClusterHealthOverview from './cluster-health-overview';
import { ShadowLinkSection } from './shadow-link-overview-card';
import colors from '../../../colors';
import { type ComponentStatus, StatusType } from '../../../protogen/redpanda/api/console/v1alpha1/cluster_status_pb';
import NurturePanel from '../../builder-io/nurture-panel';
import {
  getEnterpriseCTALink,
  isLicenseWithEnterpriseAccess,
  licensesToSimplifiedPreview,
} from '../../license/license-utils';
import { OverviewLicenseNotification } from '../../license/overview-license-notification';
import { NullFallbackBoundary } from '../../misc/null-fallback-boundary';
import { Statistic } from '../../misc/statistic';

@observer
class Overview extends PageComponent {
  @computed get hasRack() {
    return api.brokers?.sum((b) => (b.rack ? 1 : 0));
  }

  constructor(p: Readonly<{ matchedPath: string }>) {
    super(p);
    makeObservable(this);
  }

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
  }

  render() {
    if (!api.clusterOverview) {
      return DefaultSkeleton;
    }

    const overview = api.clusterOverview;
    const brokers = api.brokers ?? [];

    const clusterStatus = (() => {
      if (overview.kafka?.status?.status === StatusType.HEALTHY) {
        return { displayText: 'Running', className: 'status-green' };
      }
      if (overview.kafka?.status?.status === StatusType.DEGRADED) {
        return { displayText: 'Degraded', className: 'status-yellow' };
      }
      return { displayText: 'Unhealthy', className: 'status-red' };
    })();

    const brokerSize = brokers.length > 0 ? prettyBytes(brokers.sum((x) => x.totalLogDirSizeBytes ?? 0)) : '...';

    const renderIdColumn = (text: string, record: BrokerWithConfigAndStorage) => {
      if (!record.isController) {
        return text;
      }
      return (
        <Flex alignItems="flex-start" gap={4}>
          {text}
          <Tooltip hasArrow label="This broker is the current controller of the cluster" placement="right">
            <Box>
              <CrownIcon color="#0008" size={16} />
            </Box>
          </Tooltip>
        </Flex>
      );
    };

    const version = overview.redpanda?.version ?? overview.kafka?.version;

    return (
      <Box>
        <NullFallbackBoundary>
          <OverviewLicenseNotification />
        </NullFallbackBoundary>

        <PageContent className="overviewGrid">
          <Section my={4} py={5}>
            <Flex>
              <Statistic
                className={`status-bar ${clusterStatus.className}`}
                title="Cluster Status"
                value={clusterStatus.displayText}
              />
              <Statistic title="Cluster Storage Size" value={brokerSize} />
              <Statistic title="Cluster Version" value={version} />
              <Statistic
                title="Brokers Online"
                value={`${overview.kafka?.brokersOnline} of ${overview.kafka?.brokersExpected}`}
              />
              <Statistic title="Topics" value={overview.kafka?.topicsCount} />
              <Statistic title="Replicas" value={overview.kafka?.replicasCount} />
            </Flex>
          </Section>

          {/* Shadow Link Overview Section */}
          <ShadowLinkSection />

          <Grid gap={6} gridTemplateColumns={{ base: '1fr', lg: 'fit-content(60%) 1fr' }}>
            <GridItem display="flex" flexDirection="column" gap={6}>
              {api.clusterHealth?.isHealthy === false && (
                <Section gridArea="debugInfo" py={4}>
                  <Heading as="h3">Cluster Health Debug</Heading>
                  <ClusterHealthOverview />
                </Section>
              )}

              <Section py={4}>
                <Heading as="h3">Broker Details</Heading>
                <DataTable<BrokerWithConfigAndStorage>
                  columns={[
                    {
                      size: 80,
                      header: 'ID',
                      accessorKey: 'brokerId',
                      cell: ({ row: { original: broker } }) => renderIdColumn(`${broker.brokerId}`, broker),
                    },
                    {
                      header: 'Status',
                      cell: ({ row: { original: broker } }) => (
                        <Flex gap={2}>
                          {api.clusterHealth?.offlineBrokerIds.includes(broker.brokerId) ? (
                            <>
                              <ErrorIcon color={colors.brandError} size={18} />
                              Down
                            </>
                          ) : (
                            <>
                              <CheckIcon color={colors.green} size={18} />
                              Running
                            </>
                          )}
                        </Flex>
                      ),
                      size: Number.POSITIVE_INFINITY,
                    },
                    {
                      size: 120,
                      header: 'Size',
                      accessorKey: 'totalLogDirSizeBytes',
                      cell: ({
                        row: {
                          original: { totalLogDirSizeBytes },
                        },
                      }) => totalLogDirSizeBytes && prettyBytesOrNA(totalLogDirSizeBytes),
                    },
                    {
                      id: 'view',
                      size: 100,
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
                    ...(this.hasRack
                      ? [
                          {
                            size: 100,
                            header: 'Rack',
                            cell: ({ row: { original: broker } }: { row: Row<BrokerWithConfigAndStorage> }) =>
                              broker.rack,
                          },
                        ]
                      : []),
                  ]}
                  data={brokers}
                  defaultPageSize={10}
                  pagination
                  sorting={false}
                />
              </Section>

              <Section flexDirection="column">
                <Heading as="h3">Resources and updates</Heading>
                {Boolean(api.clusterOverview?.kafka?.distribution) && <NurturePanel />}
                <hr />
                <div className="mt-4 flex flex-row items-center gap-2 font-sm text-gray-600">
                  <a href="https://docs.redpanda.com/docs/home/">Documentation</a>
                  <span className="mx-2 text-gray-300">|</span>
                  <a href="https://docs.redpanda.com/docs/get-started/rpk-install/">CLI tools</a>
                </div>
              </Section>
            </GridItem>

            <GridItem>
              <Section py={4}>
                <h3>Cluster Details</h3>

                <ClusterDetails />
              </Section>
            </GridItem>
          </Grid>
        </PageContent>
      </Box>
    );
  }
}

export default Overview;

type DetailsBlockProps = { title: string; children?: React.ReactNode };

const DetailsBlock: FC<DetailsBlockProps> = ({ title, children }) => (
  <>
    <GridItem colSpan={{ base: 1, lg: 3 }}>
      <Heading
        as="h4"
        color="gray.500"
        fontSize={10}
        fontWeight={600}
        letterSpacing={0.8}
        mb={1}
        textTransform="uppercase"
      >
        {title}
      </Heading>
    </GridItem>
    {children}
    <GridItem bg="#ddd" colSpan={{ base: 1, lg: 3 }} height={0.25} my={4} />
  </>
);

type DetailsProps = { title: string; content: ([left?: React.ReactNode, right?: React.ReactNode] | undefined)[] };

const Details: FC<DetailsProps> = ({ title, content }) => {
  const [[firstLeft, firstRight] = [], ...rest] = content;
  return (
    <>
      <GridItem>
        <Heading as="h5">{title}</Heading>
      </GridItem>
      <GridItem>{firstLeft}</GridItem>
      <GridItem>{firstRight}</GridItem>

      {rest?.map((item) => (
        <React.Fragment key={`${String(item?.[0])}-${String(item?.[1])}`}>
          <GridItem />
          <GridItem>{item?.[0]}</GridItem>
          <GridItem>{item?.[1]}</GridItem>
        </React.Fragment>
      ))}
    </>
  );
};

function ClusterDetails() {
  const overview = api.clusterOverview;
  const brokers = api.brokers;
  const licenses = api.licenses;

  if (!(overview && brokers)) {
    return <Skeleton height={4} mt={5} noOfLines={13} speed={0} />;
  }

  const totalStorageBytes = brokers.sum((x) => x.totalLogDirSizeBytes ?? 0);
  const totalPrimaryStorageBytes = brokers.sum((x) => x.totalPrimaryLogDirSizeBytes ?? 0);
  const totalReplicatedStorageBytes = totalStorageBytes - totalPrimaryStorageBytes;

  const serviceAccounts = overview.redpanda?.userCount ?? 'Admin API not configured';

  const aclCount = overview.kafkaAuthorizerInfo
    ? overview.kafkaAuthorizerInfo.aclCount
    : (overview.kafkaAuthorizerError?.message ?? 'Authorizer not configured');

  const formatStatus = (overviewStatus?: ComponentStatus): React.ReactNode => {
    if (!overviewStatus) {
      return null;
    }
    let status = <div>{titleCase(StatusType[overviewStatus.status])}</div>;
    if (overviewStatus.statusReason) {
      status = (
        <Tooltip hasArrow label={overviewStatus.statusReason}>
          {status}
        </Tooltip>
      );
    }
    return status;
  };

  const clusters = overview.kafkaConnect?.clusters ?? [];
  const hasConnect = overview.kafkaConnect !== null && clusters.length > 0;
  const clusterLines = clusters.map((c) => ({
    name: c.name,
    status: formatStatus(c.status),
  }));

  return (
    <Grid alignItems="center" gap={2} templateColumns={{ base: 'auto', lg: 'repeat(3, auto)' }} w="full">
      <DetailsBlock title="Services">
        <Details
          content={hasConnect ? clusterLines.map((c) => [c.name, c.status]) : [['Not configured']]}
          title="Kafka Connect"
        />
        <Details
          content={
            overview.schemaRegistry !== null
              ? [
                  [
                    formatStatus(overview.schemaRegistry.status),
                    overview.schemaRegistry?.status?.status === StatusType.HEALTHY
                      ? `${overview.schemaRegistry.registeredSubjectsCount} schemas`
                      : undefined,
                  ],
                ]
              : [['Not configured']]
          }
          title="Schema Registry"
        />
      </DetailsBlock>

      <DetailsBlock title="Storage">
        <Details content={[[prettyBytesOrNA(totalStorageBytes)]]} title="Total Bytes" />

        <Details content={[[prettyBytesOrNA(totalPrimaryStorageBytes)]]} title="Primary" />

        <Details content={[[prettyBytesOrNA(totalReplicatedStorageBytes)]]} title="Replicated" />
      </DetailsBlock>

      <DetailsBlock title="Security">
        <Details
          content={[
            [
              <Link key={0} params={{ tab: 'users' }} to="/security/$tab">
                {serviceAccounts}
              </Link>,
            ],
          ]}
          title="Service Accounts"
        />

        <Details
          content={[
            [
              <Link key={0} params={{ tab: 'acls' }} to="/security/$tab">
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
                  <Flex alignItems="center" gap={1} key="error">
                    <AlertIcon color={colors.brandError} size={16} /> Failed to load license info
                  </Flex>,
                ],
              ]
            : [
                ...licensesToSimplifiedPreview(licenses).map(
                  ({ name, expiresAt, isExpired }) =>
                    [
                      <Text data-testid="overview-license-name" key={0}>
                        {name}
                      </Text>,
                      expiresAt.length > 0 ? `(${isExpired ? 'expired' : 'expiring'} ${expiresAt})` : '',
                    ] as [left: ReactNode, right: ReactNode]
                ),
              ]
        }
        title="Licensing"
      />

      {api.licensesLoaded === 'loaded' && !api.licenses.some(isLicenseWithEnterpriseAccess) && (
        <>
          <GridItem />
          <GridItem colSpan={{ base: 1, lg: 2 }}>
            <a href={getEnterpriseCTALink('tryEnterprise')} rel="noopener noreferrer" target="_blank">
              <Badge variant="info">
                <Text textDecoration="underline">Redpanda Enterprise trial available</Text>
              </Badge>
            </a>
          </GridItem>
        </>
      )}

      {Boolean(api.isRedpanda && api.isAdminApiConfigured && api.userData?.canManageLicense) && (
        <>
          <GridItem />
          <GridItem colSpan={{ base: 1, lg: 2 }}>
            <Link to="/upload-license">Upload new license</Link>
          </GridItem>
        </>
      )}
    </Grid>
  );
}
