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
import type { FC } from 'react';

import { appGlobal } from '../../../state/app-global';
import { api } from '../../../state/backend-api';
import type { ConfigEntry } from '../../../state/rest-interfaces';
import { useUISettingsStore } from '../../../state/ui';
import { DefaultSkeleton, OptionGroup } from '../../../utils/tsx-utils';
import { prettyBytesOrNA } from '../../../utils/utils';
import { ConfigList } from '../../misc/config-list';
import PageContent from '../../misc/page-content';
import Section from '../../misc/section';
import { Statistic } from '../../misc/statistic';
import { PageComponent, type PageInitHelper } from '../page';

class BrokerDetails extends PageComponent<{ brokerId: string }> {
  initPage(p: PageInitHelper): void {
    p.title = 'Broker Details';
    p.addBreadcrumb('Overview', '/overview');

    const id = Number(this.props.brokerId);
    p.addBreadcrumb(`Broker #${id}`, `/overview/${id}`);

    this.refreshData(true);
    appGlobal.onRefresh = () => this.refreshData(true);
  }

  refreshData(force: boolean) {
    api.refreshClusterOverview();
    api.refreshBrokers(force);
    api.refreshBrokerConfig(Number(this.props.brokerId));
  }

  render() {
    return <BrokerDetailsContent brokerId={Number(this.props.brokerId)} />;
  }
}

export { BrokerDetails };

const BrokerDetailsContent: FC<{ brokerId: number }> = ({ brokerId }) => {
  const brokerConfigs = api.brokerConfigs.get(brokerId);
  if (brokerConfigs === undefined || brokerConfigs.length === 0) {
    return DefaultSkeleton;
  }

  const broker = api.brokers?.first((x) => x.brokerId === brokerId);
  if (!broker) {
    return DefaultSkeleton;
  }

  // Handle error while getting config
  if (typeof brokerConfigs === 'string') {
    return (
      <div className="error">
        <h3>Error</h3>
        <div>
          <p>{brokerConfigs}</p>
        </div>
      </div>
    );
  }

  return (
    <PageContent>
      <Section py={4}>
        <Flex>
          <Statistic title="Broker ID" value={brokerId} />
          <Statistic title="Role" value={broker.isController ? 'Controller' : 'Follower'} />
          {/* biome-ignore lint/style/noNonNullAssertion: not touching MobX observables */}
          <Statistic title="Storage" value={prettyBytesOrNA(broker.totalLogDirSizeBytes!)} />
          <Statistic title="IP address" value={broker.address} />
          {Boolean(broker.rack) && <Statistic title="Rack" value={broker.rack} />}
        </Flex>
      </Section>
      <Section py={4}>
        <BrokerConfigView entries={brokerConfigs} />
      </Section>
    </PageContent>
  );
};

const BrokerConfigView: FC<{ entries: ConfigEntry[] }> = ({ entries }) => {
  const { brokerList, updateSettings } = useUISettingsStore();

  const sorted = entries.slice().sort((a, b) => {
    switch (brokerList.propsOrder) {
      case 'default':
        return 0;
      case 'alphabetical':
        return a.name.localeCompare(b.name);
      case 'changedFirst': {
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
      <div className="brokerConfigViewSettings" style={{ marginLeft: '1px', marginBottom: '1em' }}>
        <Flex gap="2rem">
          <OptionGroup
            label="Formatting"
            onChange={(s) => updateSettings({ brokerList: { ...brokerList, valueDisplay: s } })}
            options={{
              Friendly: 'friendly',
              Raw: 'raw',
            }}
            value={brokerList.valueDisplay}
          />
          <OptionGroup
            label="Sort"
            onChange={(s) => updateSettings({ brokerList: { ...brokerList, propsOrder: s } })}
            options={{
              'Changed First': 'changedFirst',
              Alphabetical: 'alphabetical',
              None: 'default',
            }}
            value={brokerList.propsOrder}
          />
        </Flex>
      </div>
      <ConfigList configEntries={sorted} key={brokerList.propsOrder} valueDisplay={brokerList.valueDisplay} />
    </div>
  );
};
