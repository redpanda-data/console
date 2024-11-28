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

import { Flex } from '@redpanda-data/ui';
import { makeObservable, observable } from 'mobx';
import { observer } from 'mobx-react';
import { Component } from 'react';
import { appGlobal } from '../../../state/appGlobal';
import { api } from '../../../state/backendApi';
import type { ConfigEntry } from '../../../state/restInterfaces';
import { uiSettings } from '../../../state/ui';
import { DefaultSkeleton, OptionGroup } from '../../../utils/tsxUtils';
import { prettyBytesOrNA } from '../../../utils/utils';
import { ConfigList } from '../../misc/ConfigList';
import PageContent from '../../misc/PageContent';
import Section from '../../misc/Section';
import { Statistic } from '../../misc/Statistic';
import { PageComponent, type PageInitHelper } from '../Page';

@observer
class BrokerDetails extends PageComponent<{ brokerId: string }> {
  @observable id = 0;

  constructor(p: any) {
    super(p);
    makeObservable(this);

    this.id = Number(this.props.brokerId);
  }

  initPage(p: PageInitHelper): void {
    p.title = 'Broker Details';
    p.addBreadcrumb('Overview', '/overview');

    const id = Number(this.props.brokerId);
    p.addBreadcrumb(`Broker #${id}`, `/overview/${id}`);

    this.refreshData(true);
    appGlobal.onRefresh = () => this.refreshData(true);
  }

  refreshData(force: boolean) {
    api.refreshClusterOverview(force);
    api.refreshBrokers(force);
    api.refreshBrokerConfig(Number(this.props.brokerId));
  }

  render() {
    const brokerConfigs = api.brokerConfigs.get(this.id);
    if (brokerConfigs === undefined || brokerConfigs.length === 0) {
      return DefaultSkeleton;
    }

    const broker = api.brokers?.first((x) => x.brokerId === this.id);
    if (!broker) {
      return DefaultSkeleton;
    }

    // Handle error while getting config
    if (typeof brokerConfigs === 'string')
      return (
        <div className="error">
          <h3>Error</h3>
          <div>
            <p>{brokerConfigs}</p>
          </div>
        </div>
      );

    return (
      <>
        <PageContent>
          <Section py={4}>
            <Flex>
              <Statistic title="Broker ID" value={this.id} />
              <Statistic title="Role" value={broker.isController ? 'Controller' : 'Follower'} />
              {/* biome-ignore lint/style/noNonNullAssertion: not touching MobX observables */}
              <Statistic title="Storage" value={prettyBytesOrNA(broker.totalLogDirSizeBytes!)} />
              <Statistic title="IP address" value={broker.address} />
              {broker.rack && <Statistic title="Rack" value={broker.rack} />}
            </Flex>
          </Section>
          <Section py={4}>
            <BrokerConfigView entries={brokerConfigs} />
          </Section>
        </PageContent>
      </>
    );
  }
}

export { BrokerDetails };

@observer
class BrokerConfigView extends Component<{ entries: ConfigEntry[] }> {
  render() {
    const entries = this.props.entries.slice().sort((a, b) => {
      switch (uiSettings.brokerList.propsOrder) {
        case 'default':
          return 0;
        case 'alphabetical':
          return a.name.localeCompare(b.name);
        case 'changedFirst': {
          if (uiSettings.brokerList.propsOrder !== 'changedFirst') return 0;
          const v1 = a.isExplicitlySet ? 1 : 0;
          const v2 = b.isExplicitlySet ? 1 : 0;
          return v2 - v1;
        }
        default:
          return 0;
      }
    });

    return (
      <div className="brokerConfigView">
        <DetailsDisplaySettings />
        <ConfigList
          key={uiSettings.brokerList.propsOrder}
          configEntries={entries}
          valueDisplay={uiSettings.brokerList.valueDisplay}
        />
      </div>
    );
  }
}

const DetailsDisplaySettings = observer(() => (
  <div style={{ marginLeft: '1px', marginBottom: '1em' }} className="brokerConfigViewSettings">
    <Flex gap="2rem">
      <OptionGroup
        label="Formatting"
        options={{
          Friendly: 'friendly',
          Raw: 'raw',
        }}
        value={uiSettings.brokerList.valueDisplay}
        onChange={(s) => (uiSettings.brokerList.valueDisplay = s)}
      />
      <OptionGroup
        label="Sort"
        options={{
          'Changed First': 'changedFirst',
          Alphabetical: 'alphabetical',
          None: 'default',
        }}
        value={uiSettings.brokerList.propsOrder}
        onChange={(s) => (uiSettings.brokerList.propsOrder = s)}
      />
    </Flex>
  </div>
));
