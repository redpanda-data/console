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
import { Empty, Statistic, Row, Tooltip, Button } from 'antd';
import Table from 'antd/lib/table';
import { PageComponent, PageInitHelper } from '../Page';
import { api } from '../../../state/backendApi';
import { uiSettings } from '../../../state/ui';
import { sortField } from '../../misc/common';
import { Broker } from '../../../state/restInterfaces';
import { computed, makeObservable } from 'mobx';
import { prettyBytesOrNA } from '../../../utils/utils';
import { appGlobal } from '../../../state/appGlobal';
import { CrownOutlined } from '@ant-design/icons';
import { DefaultSkeleton, findPopupContainer } from '../../../utils/tsxUtils';
import { KowlColumnType, KowlTable } from '../../misc/KowlTable';
import Section from '../../misc/Section';
import PageContent from '../../misc/PageContent';
import './Overview.scss';
import rawNewsArray from '../../../assets/news.json';
import { Icon } from '@redpanda-data/ui';
import { IoWarning } from 'react-icons/io5';
import { CheckIcon } from '@primer/octicons-react';


@observer
class Overview extends PageComponent {

    @computed get hasRack() { return api.clusterInfo?.brokers?.sum(b => b.rack ? 1 : 0) }

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
    }

    render() {
        if (!api.clusterInfo) return DefaultSkeleton;
        if (api.clusterInfo.brokers.length == 0) return <Empty />

        const info = api.clusterInfo;
        const brokers = info.brokers;

        const renderIdColumn = (text: string, record: Broker) => {
            if (record.brokerId != info.controllerId) return text;
            return <>{text}
                <Tooltip mouseEnterDelay={0} overlay={'This broker is the current controller of the cluster'} getPopupContainer={findPopupContainer} placement="right">
                    <CrownOutlined style={{ padding: '2px', fontSize: '16px', color: '#0008', float: 'right' }} />
                </Tooltip>
            </>
        };

        const columns: KowlColumnType<Broker>[] = [
            { width: '80px', title: 'ID', dataIndex: 'brokerId', render: renderIdColumn, sorter: sortField('brokerId'), defaultSortOrder: 'ascend' },
            Table.EXPAND_COLUMN,
            {
                width: 'auto', title: 'Status', render: (_, _r) => {
                    return <>
                        <Icon as={CheckIcon} fontSize="18px" marginRight="5px" color="green.500" />
                        Running
                    </>
                }
            },
            { width: '120px', title: 'Size', dataIndex: 'logDirSize', render: (t: number) => prettyBytesOrNA(t), sorter: sortField('logDirSize') },
            {
                width: '100px', title: '', render: (_, r) => {
                    return <Button onClick={() => appGlobal.history.push('/overview/' + r.brokerId)}>
                        View
                    </Button>
                }
            }

        ]

        if (this.hasRack)
            columns.push({ width: '100px', title: 'Rack', dataIndex: 'rack', sorter: sortField('rack') });

        return <>
            <PageContent>
                <div className="overviewGrid">
                    <Section py={4} gridArea="health">
                        <Row>
                            <Statistic title="Cluster Status" value={'Running'} className="status-bar status-green" />
                            <Statistic title="Cluster Storage Size" value={'3.28 KiB'} />
                            <Statistic title="Cluster Version" value={info.kafkaVersion} />
                            <Statistic title="Brokers Online" value={brokers.length} />
                            <Statistic title="Topics" value={'3'} />
                        </Row>
                    </Section>

                    <Section py={4} gridArea="broker">
                        <h3>Broker Details</h3>
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
                        <ul className="resource-list">
                            {rawNewsArray.map((x, i) => <li key={i}>
                                <a href={x.url} rel="" className="resource-link" >
                                    <span className="dot">&bull;</span>
                                    {x.title}
                                    <ResourcesBadge type={x.badge} />
                                </a>
                            </li>)}
                        </ul>
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
            return <div className="badge-new">New</div>

        default:
            return null;
    }
};


function ClusterDetails(_p: {}) {

    const DetailsGroup = (p: { title: string, children?: React.ReactNode }) => {
        return <>
            <h4>{p.title}</h4>
            {p.children}
            <Line />
        </>
    }

    const Line = () => {
        return <div className="separationLine"></div>
    }

    return <div className="clusterDetails">
        <DetailsGroup title="Services">
            <h5>Schema Registry</h5>
            <div>Running</div>
            <div></div>

            <h5>Kafka Connect</h5>
            <div style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px'
            }}>Not configured <Icon as={IoWarning} fontSize="21px" color="#eb8314" /> </div>
            <div></div>
        </DetailsGroup>


        <DetailsGroup title="Storage">
            <h5>Primary bytes</h5>
            <div>277 Bytes</div>
            <div></div>

            <h5>Replicated bytes</h5>
            <div>{277 * 2} Bytes</div>
            <div></div>
        </DetailsGroup>



        <DetailsGroup title="Security" >
            <h5>Users</h5>
            <div>
                <a href="#" onClick={() => appGlobal.history.push('/acls/')}>4</a>
            </div>
            <div></div>

            <h5>ACLs</h5>
            <div>
                <a href="#" onClick={() => appGlobal.history.push('/acls/')}>10</a>
            </div>
            <div></div>
        </DetailsGroup>


        <h5>Licensing</h5>
        <div>Debug (Enterprise)</div>
        <div>expires 1/1/2099</div>
    </div>
}
