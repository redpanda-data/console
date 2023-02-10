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

import { Component } from 'react';
import { observer } from 'mobx-react';
import { Row, Space, Statistic } from 'antd';
import { PageComponent, PageInitHelper } from '../Page';
import { api } from '../../../state/backendApi';
import { uiSettings } from '../../../state/ui';
import { ConfigEntry } from '../../../state/restInterfaces';
import { observable, makeObservable } from 'mobx';
import { appGlobal } from '../../../state/appGlobal';
import { DefaultSkeleton, OptionGroup } from '../../../utils/tsxUtils';
import { ConfigList } from '../../misc/ConfigList';
import Section from '../../misc/Section';
import PageContent from '../../misc/PageContent';
import { prettyBytesOrNA } from '../../../utils/utils';


@observer
class BrokerDetails extends PageComponent<{ brokerId: string }> {

    @observable id = 0;

    constructor(p: any) {
        super(p);
        makeObservable(this);
    }

    initPage(p: PageInitHelper): void {
        p.title = 'Broker Details';
        p.addBreadcrumb('Overview', '/overview');

        const id = this.props.brokerId;
        this.id = Number(id);
        p.addBreadcrumb(`Broker #${id}`, `/overview/${id}`);

        this.refreshData(false);
        appGlobal.onRefresh = () => this.refreshData(true);
    }

    refreshData(force: boolean) {
        api.refreshClusterOverview(force);
        api.refreshBrokers(force);
        api.refreshBrokerConfig(this.id);
    }

    render() {
        const brokerConfigs = api.brokerConfigs.get(this.id);
        if (brokerConfigs === undefined || brokerConfigs.length == 0) {
            return DefaultSkeleton;
        }

        const broker = api.brokers?.first(x => x.brokerId == this.id);
        if (!broker)
            return DefaultSkeleton;
        const isController = api.clusterOverview?.kafka.controllerId == this.id;

        // Handle error while getting config
        if (typeof brokerConfigs == 'string') return (
            <div className="error">
                <h3>Error</h3>
                <div>
                    <p>{brokerConfigs}</p>
                </div>
            </div>
        );

        return <>
            <PageContent>
                <Section py={4}>
                    <Row>
                        <Statistic title="Broker ID" value={this.id} />
                        <Statistic title="Role" value={isController ? 'Controller' : 'Follower'} />
                        <Statistic title="Storage" value={prettyBytesOrNA(broker.totalLogDirSizeBytes!)} />
                        {broker.rack && <Statistic title="Rack" value={broker.rack} />}
                    </Row>
                </Section>
                <Section py={4} >
                    <BrokerConfigView entries={brokerConfigs} />
                </Section>
            </PageContent>
        </>
    }
}

export { BrokerDetails };

@observer
class BrokerConfigView extends Component<{ entries: ConfigEntry[] }> {
    render() {
        const entries = this.props.entries
            .slice()
            .sort((a, b) => {
                switch (uiSettings.brokerList.propsOrder) {
                    case 'default':
                        return 0;
                    case 'alphabetical':
                        return a.name.localeCompare(b.name);
                    case 'changedFirst':
                        if (uiSettings.brokerList.propsOrder != 'changedFirst') return 0;
                        const v1 = a.isExplicitlySet ? 1 : 0;
                        const v2 = b.isExplicitlySet ? 1 : 0;
                        return v2 - v1;
                    default: return 0;
                }
            });

        return (
            <div className="brokerConfigView">
                <DetailsDisplaySettings />
                <ConfigList configEntries={entries} valueDisplay={uiSettings.brokerList.valueDisplay} />
            </div>
        );
    }
}


const DetailsDisplaySettings = observer(() =>
    <div style={{ marginLeft: '1px', marginBottom: '1em' }} className="brokerConfigViewSettings">
        <Row>
            <Space size="middle">

                <OptionGroup label="Formatting"
                    options={{
                        'Friendly': 'friendly',
                        'Raw': 'raw'
                    }}
                    value={uiSettings.brokerList.valueDisplay}
                    onChange={s => uiSettings.brokerList.valueDisplay = s}
                />

                <OptionGroup label="Sort"
                    options={{
                        'Changed First': 'changedFirst',
                        'Alphabetical': 'alphabetical',
                        'None': 'default',
                    }}
                    value={uiSettings.brokerList.propsOrder}
                    onChange={s => uiSettings.brokerList.propsOrder = s}
                />
            </Space>
        </Row>
    </div>);
