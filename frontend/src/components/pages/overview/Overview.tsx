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

import { observer } from 'mobx-react';
import { PageComponent, PageInitHelper } from '../Page';
import { api } from '../../../state/backendApi';
import { uiSettings } from '../../../state/ui';
import { sortField } from '../../misc/common';
import { BrokerWithConfigAndStorage, OverviewStatus, RedpandaLicense } from '../../../state/restInterfaces';
import { computed, makeObservable } from 'mobx';
import { prettyBytes, prettyBytesOrNA, titleCase } from '../../../utils/utils';
import { appGlobal } from '../../../state/appGlobal';
import { CrownOutlined } from '@ant-design/icons';
import { DefaultSkeleton } from '../../../utils/tsxUtils';
import { KowlColumnType, KowlTable } from '../../misc/KowlTable';
import Section from '../../misc/Section';
import PageContent from '../../misc/PageContent';
import './Overview.scss';
import { Button, Flex, Heading, Icon, Link, Skeleton, Tooltip } from '@redpanda-data/ui';
import { CheckIcon } from '@primer/octicons-react';
import { Link as ReactRouterLink } from 'react-router-dom';
import React from 'react';
import { Statistic } from '../../misc/Statistic';

@observer
class Overview extends PageComponent {
    @computed get hasRack() {
        return api.brokers?.sum(b => (b.rack ? 1 : 0));
    }

    constructor(p: any) {
        super(p);
        makeObservable(this);
    }

    initPage(p: PageInitHelper): void {
        p.title = 'Overview';
        p.addBreadcrumb('Overview', '/overview');

        this.refreshData(false);
        appGlobal.onRefresh = () => this.refreshData(true);
    }

    refreshData(force: boolean) {
        api.refreshCluster(force);
        api.refreshClusterOverview(force);
        api.refreshBrokers(force);
        api.refreshNews(force);
    }

    render() {
        if (!api.clusterOverview) return DefaultSkeleton;

        const overview = api.clusterOverview;
        const brokers = api.brokers ?? [];

        const clusterStatus = overview.kafka.status == 'HEALTHY' ? { displayText: 'Running', className: 'status-green' } : overview.kafka.status == 'DEGRADED' ? { displayText: 'Degraded', className: 'status-yellow' } : { displayText: 'Unhealthy', className: 'status-red' };

        const brokerSize = brokers.length > 0 ? prettyBytes(brokers.sum(x => x.totalLogDirSizeBytes ?? 0)) : '...';

        const renderIdColumn = (text: string, record: BrokerWithConfigAndStorage) => {
            if (!record.isController) return text;
            return (
                <>
                    {text}
                    <Tooltip label="This broker is the current controller of the cluster" placement="right" hasArrow>
                        <CrownOutlined style={{ padding: '2px', fontSize: '16px', color: '#0008', float: 'right' }} />
                    </Tooltip>
                </>
            );
        };

        const columns: KowlColumnType<BrokerWithConfigAndStorage>[] = [
            {
                width: '80px',
                title: 'ID',
                dataIndex: 'brokerId',
                render: renderIdColumn,
                sorter: sortField('brokerId'),
                defaultSortOrder: 'ascend'
            },
            {
                width: 'auto',
                title: 'Status',
                render: (_, _r) => {
                    return (
                        <>
                            <Icon as={CheckIcon} fontSize="18px" marginRight="5px" color="green.500" />
                            Running
                        </>
                    );
                }
            },
            {
                width: '120px',
                title: 'Size',
                dataIndex: 'totalLogDirSizeBytes',
                render: (t: number) => prettyBytesOrNA(t),
                sorter: sortField('totalLogDirSizeBytes')
            },
            {
                width: '100px',
                title: '',
                render: (_, r) => {
                    return (
                        <Button size="sm" variant="ghost" onClick={() => appGlobal.history.push('/overview/' + r.brokerId)}>
                            View
                        </Button>
                    );
                }
            }
        ];

        if (this.hasRack) columns.splice(3, 0, { width: '100px', title: 'Rack', render: (_, r) => r.rack });

        const version = overview.redpanda.version ?? overview.kafka.version;
        const news = api.news?.filter(e => {
            const distribution = overview.kafka.distribution;
            if (e.intendedAudience == 'all' || !distribution) return true;
            if (e.intendedAudience == 'apache' && distribution == 'APACHE_KAFKA') return true;
            if (e.intendedAudience == 'redpanda' && distribution == 'REDPANDA') return true;
            return false;
        });

        return <>
            <PageContent>
                <div className="overviewGrid">
                    {/*
                    <Section py={5} gridArea="health">
                        <Grid flexDirection="row">
                            <Grid templateColumns="max-content 1fr" gap={3}>
                                <Box
                                    backgroundColor={`green.500`}
                                    w="4px"
                                    h="full"
                                    borderRadius="10px"
                                />
                                <Stat>
                                    <StatNumber>{clusterStatus.displayText}</StatNumber>
                                    <StatLabel>Cluster Status</StatLabel>
                                </Stat>
                            </Grid>

                            <Stat>
                                <StatNumber>{brokerSize}</StatNumber>
                                <StatLabel>Cluster Storage Size</StatLabel>
                            </Stat>

                            <Stat>
                                <StatNumber>{version}</StatNumber>
                                <StatLabel>Cluster Version</StatLabel>
                            </Stat>

                            <Stat>
                                <StatNumber>{`${overview.kafka.brokersOnline} of ${overview.kafka.brokersExpected}`}</StatNumber>
                                <StatLabel>Brokers Online</StatLabel>
                            </Stat>

                            <Stat>
                                <StatNumber>{overview.kafka.topicsCount}</StatNumber>
                                <StatLabel>Topics</StatLabel>
                            </Stat>
                        </Grid>
                    </Section>
                     */}
                    <Section py={5} gridArea="health">
                        <Flex>
                            <Statistic title="Cluster Status" value={clusterStatus.displayText} className={'status-bar ' + clusterStatus.className} />
                            <Statistic title="Cluster Storage Size" value={brokerSize} />
                            <Statistic title="Cluster Version" value={version} />
                            <Statistic title="Brokers Online" value={`${overview.kafka.brokersOnline} of ${overview.kafka.brokersExpected}`} />
                            <Statistic title="Topics" value={overview.kafka.topicsCount} />
                            <Statistic title="Replicas" value={overview.kafka.replicasCount} />
                        </Flex>
                    </Section>

                    <Section py={4} gridArea="broker">
                        <Heading as="h3" >Broker Details</Heading>
                        <KowlTable
                            dataSource={brokers}
                            columns={columns}
                            observableSettings={uiSettings.brokerList}
                            rowKey={(x) => x.brokerId.toString()}
                            rowClassName={() => 'pureDisplayRow'}
                            pagination={{
                                visible: false
                            }}
                        />
                    </Section>

                    <Section py={4} gridArea="resources">
                        <h3>Resources and updates</h3>

                        <div style={{ display: 'flex', flexDirection: 'row', maxWidth: '600px', gap: '5rem' }}>
                            <ul className="resource-list">
                                <li><a href="https://docs.redpanda.com/docs/home/" rel="" className="resource-link" >
                                    <span className="dot">&bull;</span>
                                    Documentation
                                </a></li>
                                <li><a href="https://docs.redpanda.com/docs/get-started/rpk-install/" rel="" className="resource-link" >
                                    <span className="dot">&bull;</span>
                                    CLI Tools
                                </a></li>
                            </ul>

                            <ul className="resource-list">
                                <Skeleton
                                    isLoaded={Boolean(news)}
                                    noOfLines={4}
                                >
                                    {news?.map((x, i) => <li key={i}>
                                        <a href={x.url} rel="noopener noreferrer" target="_blank"
                                           className="resource-link">
                                            <span className="dot">&bull;</span>
                                            <span>
                                                {x.title}
                                                <ResourcesBadge type={x.badge}/>
                                            </span>
                                        </a>
                                    </li>)}
                                </Skeleton>
                            </ul>
                        </div>

                    </Section>

                    <Section py={4} gridArea="details">
                        <h3>Cluster Details</h3>

                        <ClusterDetails />
                    </Section>
                </div>
            </PageContent>
        </>
    }
}

export default Overview;

const ResourcesBadge = (p: { type?: string | undefined }) => {
    switch (p.type) {
        case 'new':
            return <span className="badge-wrapper">
                <div className="badge-new">New</div>
            </span>

        default:
            return null;
    }
};


function ClusterDetails() {
    const overview = api.clusterOverview;
    const brokers = api.brokers;

    if (!overview || !brokers) {
        return <Skeleton mt={5} noOfLines={13} height={4} speed={0} />
    }

    const totalStorageBytes = brokers.sum(x => x.totalLogDirSizeBytes ?? 0);
    const totalPrimaryStorageBytes = brokers.sum(x => x.totalPrimaryLogDirSizeBytes ?? 0);
    const totalReplicatedStorageBytes = totalStorageBytes - totalPrimaryStorageBytes;


    const serviceAccounts = overview.redpanda.userCount
        ?? 'Admin API not configured';

    const aclCount = overview.kafka.authorizer?.aclCount
        ?? 'Authorizer not configured';

    const consoleLicense = prettyLicense(overview.console.license);
    const redpandaLicense = prettyLicense(overview.redpanda.license);


    const DetailsBlock = (p: { title: string, children?: React.ReactNode }) => {
        return <>
            <h4>{p.title}</h4>
            {p.children}
            <div className="separationLine"></div>
        </>
    }

    const Details = (p: { title: string, content: ([left?: React.ReactNode, right?: React.ReactNode] | undefined)[] }) => {
        const { title, content } = p;

        const lines = [];
        for (let i = 0; i < content.length; i++) {
            const pair = content[i];
            if (!pair) continue;
            let [left, right] = pair;
            if (!left) continue;

            if (typeof left == 'string')
                left = <div>{left}</div>
            if (typeof right == 'string')
                right = <div>{right}</div>

            const isFirst = i == 0;

            lines.push(<React.Fragment key={i}>
                {isFirst ? <h5>{title}</h5> : <div />}
                {left}
                {right ? right : <div />}
            </React.Fragment>);
        }

        return <>{lines}</>;
    };

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
    const hasConnect = overview.kafkaConnect?.isConfigured == true && clusters.length > 0;
    const clusterLines = clusters.map(c => {
        return {
            name: c.name,
            status: formatStatus(c)
        }
    });

    return <div className="clusterDetails">
        <DetailsBlock title="Services">
            <Details title="Kafka Connect" content={hasConnect
                ? clusterLines.map(c => [c.name, c.status])
                : [
                    ['Not configured']
                ]
            } />
            <Details title="Schema Registry" content={overview.schemaRegistry.isConfigured
                ? [
                    [
                        formatStatus(overview.schemaRegistry),
                        (overview.schemaRegistry.status == 'HEALTHY' && overview.schemaRegistry.isConfigured)
                            ? `${overview.schemaRegistry.registeredSubjects} schemas`
                            : undefined
                    ]
                ]
                : [
                    ['Not configured']
                ]
            } />

        </DetailsBlock>


        <DetailsBlock title="Storage">
            <Details title="Total Bytes" content={[
                [prettyBytesOrNA(totalStorageBytes)]
            ]} />

            <Details title="Primary" content={[
                [prettyBytesOrNA(totalPrimaryStorageBytes)]
            ]} />

            <Details title="Replicated" content={[
                [prettyBytesOrNA(totalReplicatedStorageBytes)]
            ]} />
        </DetailsBlock>


        <DetailsBlock title="Security" >
            <Details title="Service Accounts" content={[
                [<Link key={0} as={ReactRouterLink} to="/acls/">{serviceAccounts}</Link>]
            ]} />

            <Details title="ACLs" content={[
                [<Link key={0} as={ReactRouterLink} to="/acls/">{aclCount}</Link>]
            ]} />
        </DetailsBlock>


        <Details title="Licensing" content={[
            consoleLicense && ['Console ' + consoleLicense.name, consoleLicense.expires],
            redpandaLicense && ['Redpanda ' + redpandaLicense.name, redpandaLicense.expires],
        ]} />

    </div>
}

function prettyLicenseType(type: string) {
    if (type == 'free_trial')
        return 'Free Trial';
    if (type == 'open_source')
        return 'Open Source';
    if (type == 'enterprise')
        return 'Enterprise';
    return type;
}

function prettyLicense(license?: RedpandaLicense): { name: string, expires: string } | undefined {
    if (!license)
        return undefined;

    const name = prettyLicenseType(license.type);

    const expires = license.type != 'open_source'
        ? new Date(license.expiresAt * 1000).toLocaleDateString()
        : '';

    return { name, expires };
}
