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
import { appGlobal } from '../../../state/appGlobal';
import { api } from '../../../state/backendApi';
import type { BrokerWithConfigAndStorage, OverviewStatus } from '../../../state/restInterfaces';
import { DefaultSkeleton } from '../../../utils/tsxUtils';
import { prettyBytes, prettyBytesOrNA, titleCase } from '../../../utils/utils';
import PageContent from '../../misc/PageContent';
import Section from '../../misc/Section';
import { PageComponent, type PageInitHelper } from '../Page';
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
  Link,
  Skeleton,
  Text,
  Tooltip,
} from '@redpanda-data/ui';
import type { Row } from '@tanstack/react-table';
import React, { type FC, type ReactNode } from 'react';
import { FaCrown } from 'react-icons/fa';
import { MdCheck, MdError, MdOutlineError } from 'react-icons/md';
import { Link as ReactRouterLink } from 'react-router-dom';
import colors from '../../../colors';
import { OverviewLicenseNotification } from '../../license/OverviewLicenseNotification';
import {
  getEnterpriseCTALink,
  isLicenseWithEnterpriseAccess,
  licensesToSimplifiedPreview,
} from '../../license/licenseUtils';
import { NullFallbackBoundary } from '../../misc/NullFallbackBoundary';
import { Statistic } from '../../misc/Statistic';
import ClusterHealthOverview from './ClusterHealthOverview';

@observer
class Overview extends PageComponent {
  @computed get hasRack() {
    return api.brokers?.sum((b) => (b.rack ? 1 : 0));
  }

  constructor(p: any) {
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
    api.refreshClusterOverview(force);
    api.refreshBrokers(force);
    void api.refreshClusterHealth();
    void api.refreshDebugBundleStatuses();
  }

  render() {
    if (!api.clusterOverview) return DefaultSkeleton;

    const overview = api.clusterOverview;
    const brokers = api.brokers ?? [];

    const clusterStatus =
      overview.kafka.status === 'HEALTHY'
        ? { displayText: 'Running', className: 'status-green' }
        : overview.kafka.status === 'DEGRADED'
          ? { displayText: 'Degraded', className: 'status-yellow' }
          : { displayText: 'Unhealthy', className: 'status-red' };

    const brokerSize = brokers.length > 0 ? prettyBytes(brokers.sum((x) => x.totalLogDirSizeBytes ?? 0)) : '...';

    const renderIdColumn = (text: string, record: BrokerWithConfigAndStorage) => {
      if (!record.isController) return text;
      return (
        <Flex alignItems="flex-start" gap={4}>
          {text}
          <Tooltip label="This broker is the current controller of the cluster" placement="right" hasArrow>
            <Box>
              <FaCrown size={16} color="#0008" />
            </Box>
          </Tooltip>
        </Flex>
      );
    };

    const version = overview.redpanda.version ?? overview.kafka.version;

    return (
      <Box>
        <NullFallbackBoundary>
          <OverviewLicenseNotification />
        </NullFallbackBoundary>

        <PageContent className="overviewGrid">
          <Section py={5} my={4}>
            <Flex>
              <Statistic
                title="Cluster Status"
                value={clusterStatus.displayText}
                className={`status-bar ${clusterStatus.className}`}
              />
              <Statistic title="Cluster Storage Size" value={brokerSize} />
              <Statistic title="Cluster Version" value={version} />
              <Statistic
                title="Brokers Online"
                value={`${overview.kafka.brokersOnline} of ${overview.kafka.brokersExpected}`}
              />
              <Statistic title="Topics" value={overview.kafka.topicsCount} />
              <Statistic title="Replicas" value={overview.kafka.replicasCount} />
            </Flex>
          </Section>

          <Grid gridTemplateColumns={{ base: '1fr', lg: 'fit-content(60%) 1fr' }} gap={6}>
            <GridItem display="flex" flexDirection="column" gap={6}>
              {api.clusterHealth?.isHealthy === false && (
                <Section py={4} gridArea="debugInfo">
                  <Heading as="h3">Cluster Health Debug</Heading>
                  <ClusterHealthOverview />
                </Section>
              )}

              <Section py={4}>
                <Heading as="h3">Broker Details</Heading>
                <DataTable<BrokerWithConfigAndStorage>
                  data={brokers}
                  sorting={false}
                  defaultPageSize={10}
                  pagination
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
                              <MdError size={18} color={colors.brandError} />
                              Down
                            </>
                          ) : (
                            <>
                              <MdCheck size={18} color={colors.green} />
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
                      cell: ({ row: { original: broker } }) => {
                        return (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => appGlobal.history.push(`/overview/${broker.brokerId}`)}
                          >
                            View
                          </Button>
                        );
                      },
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
                />
              </Section>

              <Section py={4}>
                <h3>Resources and updates</h3>

                <div style={{ display: 'flex', flexDirection: 'row', maxWidth: '600px', gap: '5rem' }}>
                  <ul className="resource-list">
                    <li>
                      <a href="https://docs.redpanda.com/docs/home/" rel="" className="resource-link">
                        <span className="dot">&bull;</span>
                        Documentation
                      </a>
                    </li>
                    <li>
                      <a
                        href="https://docs.redpanda.com/docs/get-started/rpk-install/"
                        rel=""
                        className="resource-link"
                      >
                        <span className="dot">&bull;</span>
                        CLI Tools
                      </a>
                    </li>
                  </ul>
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

const DetailsBlock: FC<DetailsBlockProps> = ({ title, children }) => {
  return (
    <>
      <GridItem colSpan={{ base: 1, lg: 3 }}>
        <Heading
          as="h4"
          fontSize={10}
          fontWeight={600}
          color="gray.500"
          textTransform="uppercase"
          letterSpacing={0.8}
          mb={1}
        >
          {title}
        </Heading>
      </GridItem>
      {children}
      <GridItem colSpan={{ base: 1, lg: 3 }} height={0.25} my={4} bg="#ddd" />
    </>
  );
};

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

      {rest?.map((item, idx) => (
        <React.Fragment key={idx}>
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

  if (!overview || !brokers) {
    return <Skeleton mt={5} noOfLines={13} height={4} speed={0} />;
  }

  const totalStorageBytes = brokers.sum((x) => x.totalLogDirSizeBytes ?? 0);
  const totalPrimaryStorageBytes = brokers.sum((x) => x.totalPrimaryLogDirSizeBytes ?? 0);
  const totalReplicatedStorageBytes = totalStorageBytes - totalPrimaryStorageBytes;

  const serviceAccounts = overview.redpanda.userCount ?? 'Admin API not configured';

  const aclCount = overview.kafka.authorizer?.aclCount ?? 'Authorizer not configured';

  const formatStatus = (overviewStatus: OverviewStatus): React.ReactNode => {
    let status = <div>{titleCase(overviewStatus.status)}</div>;
    if (overviewStatus.statusReason)
      status = (
        <Tooltip label={overviewStatus.statusReason} hasArrow>
          {status}
        </Tooltip>
      );
    return status;
  };

  const clusters = overview.kafkaConnect?.clusters ?? [];
  const hasConnect = overview.kafkaConnect?.isConfigured === true && clusters.length > 0;
  const clusterLines = clusters.map((c) => {
    return {
      name: c.name,
      status: formatStatus(c),
    };
  });

  return (
    <Grid w="full" templateColumns={{ base: 'auto', lg: 'repeat(3, auto)' }} gap={2} alignItems="center">
      <DetailsBlock title="Services">
        <Details
          title="Kafka Connect"
          content={hasConnect ? clusterLines.map((c) => [c.name, c.status]) : [['Not configured']]}
        />
        <Details
          title="Schema Registry"
          content={
            overview.schemaRegistry.isConfigured
              ? [
                  [
                    formatStatus(overview.schemaRegistry),
                    overview.schemaRegistry.status === 'HEALTHY' && overview.schemaRegistry.isConfigured
                      ? `${overview.schemaRegistry.registeredSubjects} schemas`
                      : undefined,
                  ],
                ]
              : [['Not configured']]
          }
        />
      </DetailsBlock>

      <DetailsBlock title="Storage">
        <Details title="Total Bytes" content={[[prettyBytesOrNA(totalStorageBytes)]]} />

        <Details title="Primary" content={[[prettyBytesOrNA(totalPrimaryStorageBytes)]]} />

        <Details title="Replicated" content={[[prettyBytesOrNA(totalReplicatedStorageBytes)]]} />
      </DetailsBlock>

      <DetailsBlock title="Security">
        <Details
          title="Service Accounts"
          content={[
            [
              <Link key={0} as={ReactRouterLink} to="/security/users/">
                {serviceAccounts}
              </Link>,
            ],
          ]}
        />

        <Details
          title="ACLs"
          content={[
            [
              <Link key={0} as={ReactRouterLink} to="/security/acls/">
                {aclCount}
              </Link>,
            ],
          ]}
        />
      </DetailsBlock>

      <Details
        title="Licensing"
        content={
          api.licensesLoaded === 'failed'
            ? [
                [
                  <Flex key="error" gap={1} alignItems="center">
                    <MdOutlineError color={colors.brandError} size={16} /> Failed to load license info
                  </Flex>,
                ],
              ]
            : [
                ...licensesToSimplifiedPreview(licenses).map(
                  ({ name, expiresAt, isExpired }) =>
                    [
                      <Text key={0} data-testid="overview-license-name">
                        {name}
                      </Text>,
                      expiresAt.length > 0 ? `(${isExpired ? 'expired' : 'expiring'} ${expiresAt})` : '',
                    ] as [left: ReactNode, right: ReactNode],
                ),
              ]
        }
      />

      {api.licensesLoaded === 'loaded' && !api.licenses.some(isLicenseWithEnterpriseAccess) && (
        <>
          <GridItem />
          <GridItem colSpan={{ base: 1, lg: 2 }}>
            <Link href={getEnterpriseCTALink('tryEnterprise')} target="_blank">
              <Badge variant="info">
                <Text textDecoration="underline">Redpanda Enterprise trial available</Text>
              </Badge>
            </Link>
          </GridItem>
        </>
      )}

      {api.isRedpanda && api.isAdminApiConfigured && (
        <>
          <GridItem />
          <GridItem colSpan={{ base: 1, lg: 2 }}>
            <Link as={ReactRouterLink} to="/admin/upload-license">
              Upload new license
            </Link>
          </GridItem>
        </>
      )}
    </Grid>
  );
}
