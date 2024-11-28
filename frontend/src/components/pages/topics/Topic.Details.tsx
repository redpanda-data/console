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

import { computed, makeObservable, observable } from 'mobx';
import { observer } from 'mobx-react';
import React from 'react';
import { appGlobal } from '../../../state/appGlobal';
import { api } from '../../../state/backendApi';
import type { ConfigEntry, Topic, TopicAction } from '../../../state/restInterfaces';
import { uiSettings } from '../../../state/ui';
import { uiState } from '../../../state/uiState';
import '../../../utils/arrayExtensions';
import { LockIcon } from '@primer/octicons-react';
import { Box, Button, Code, Flex, Popover, Result, Tooltip } from '@redpanda-data/ui';
import { MdError, MdOutlineWarning, MdOutlineWarningAmber } from 'react-icons/md';
import colors from '../../../colors';
import { isServerless } from '../../../config';
import { AppFeatures } from '../../../utils/env';
import { DefaultSkeleton } from '../../../utils/tsxUtils';
import PageContent from '../../misc/PageContent';
import Section from '../../misc/Section';
import Tabs from '../../misc/tabs/Tabs';
import { PageComponent, type PageInitHelper } from '../Page';
import DeleteRecordsModal from './DeleteRecordsModal/DeleteRecordsModal';
import { TopicQuickInfoStatistic } from './QuickInfo';
import AclList from './Tab.Acl/AclList';
import { TopicConfiguration } from './Tab.Config';
import { TopicConsumers } from './Tab.Consumers';
import { TopicDocumentation } from './Tab.Docu';
import { DeleteRecordsMenuItem, TopicMessageView } from './Tab.Messages';
import { TopicPartitions } from './Tab.Partitions';

const TopicTabIds = ['messages', 'consumers', 'partitions', 'configuration', 'documentation', 'topicacl'] as const;
export type TopicTabId = (typeof TopicTabIds)[number];

// A tab (specifying title+content) that disable/lock itself if the user doesn't have some required permissions.
class TopicTab {
  constructor(
    public readonly topicGetter: () => Topic | undefined | null,
    public id: TopicTabId,
    private requiredPermission: TopicAction,
    public titleText: React.ReactNode,
    private contentFunc: (topic: Topic) => React.ReactNode,
    private disableHooks?: ((topic: Topic) => React.ReactNode | undefined)[],
  ) {}

  @computed get isEnabled(): boolean {
    const topic = this.topicGetter();

    if (topic && this.disableHooks) {
      for (const h of this.disableHooks) {
        if (h(topic)) return false;
      }
    }

    if (!topic) return true; // no data yet
    if (!topic.allowedActions || topic.allowedActions[0] === 'all') return true; // Redpanda Console free version

    return topic.allowedActions.includes(this.requiredPermission);
  }

  @computed get isDisabled(): boolean {
    return !this.isEnabled;
  }

  @computed get title(): React.ReactNode {
    if (this.isEnabled) return this.titleText;

    const topic = this.topicGetter();
    if (topic && this.disableHooks) {
      for (const h of this.disableHooks) {
        const replacementTitle = h(topic);
        if (replacementTitle) return replacementTitle;
      }
    }

    return (
      1 && (
        <Popover
          content={`You're missing the required permission '${this.requiredPermission}' to view this tab`}
          hideCloseButton={true}
        >
          <div>
            <LockIcon size={16} /> {this.titleText}
          </div>
        </Popover>
      )
    );
  }

  @computed get content(): React.ReactNode {
    const topic = this.topicGetter();
    if (topic) return this.contentFunc(topic);
    return null;
  }
}

const mkDocuTip = (text: string, icon?: JSX.Element) => (
  <Tooltip label={text} placement="left" hasArrow>
    <span>{icon ?? null}Documentation</span>
  </Tooltip>
);
const warnIcon = (
  <span style={{ fontSize: '15px', marginRight: '5px', transform: 'translateY(1px)', display: 'inline-block' }}>
    <MdOutlineWarningAmber />
  </span>
);

@observer
class TopicDetails extends PageComponent<{ topicName: string }> {
  @observable deleteRecordsModalAlive = false;

  topicTabs: TopicTab[] = [];

  constructor(props: any) {
    super(props);

    if (isServerless()) this.topicTabs.removeAll((x) => x.id === 'documentation');

    makeObservable(this);
  }

  initPage(p: PageInitHelper): void {
    const topicName = this.props.topicName;
    uiState.currentTopicName = topicName;

    this.refreshData(true);
    appGlobal.onRefresh = () => this.refreshData(true);

    p.title = topicName;
    p.addBreadcrumb('Topics', '/topics');
    p.addBreadcrumb(topicName, `/topics/${topicName}`, undefined, {
      canBeCopied: true,
      canBeTruncated: true,
    });
  }

  refreshData(force: boolean) {
    // must know what distribution we're working with; redpanda has some differences
    api.refreshClusterOverview(force);

    // there is no single endpoint to refresh a single topic
    api.refreshTopics(force);

    api.refreshTopicPermissions(this.props.topicName, force);

    // consumers are lazy loaded because they're (relatively) expensive
    if (uiSettings.topicDetailsActiveTabKey === 'consumers') api.refreshTopicConsumers(this.props.topicName, force);

    // partitions are always required to display message count in the statistics bar
    api.refreshPartitionsForTopic(this.props.topicName, force);

    // configuration is always required for the statistics bar
    api.refreshTopicConfig(this.props.topicName, force);

    void api.refreshClusterHealth();

    // documentation can be lazy loaded
    if (uiSettings.topicDetailsActiveTabKey === 'documentation')
      api.refreshTopicDocumentation(this.props.topicName, force);

    // ACL can be lazy loaded
    if (uiSettings.topicDetailsActiveTabKey === 'topicacl') api.refreshTopicAcls(this.props.topicName, force);
  }

  @computed get topic(): undefined | Topic | null {
    // undefined = not yet known, null = known to be null
    if (!api.topics) return undefined;
    const topic = api.topics.find((e) => e.topicName === this.props.topicName);
    if (!topic) return null;
    return topic;
  }
  @computed get topicConfig(): undefined | ConfigEntry[] | null {
    const config = api.topicConfig.get(this.props.topicName);
    if (config === undefined) return undefined;
    if (config === null || config.error != null) return null;
    return config.configEntries;
  }

  get selectedTabId(): TopicTabId {
    function computeTabId() {
      // use url anchor if possible
      let key = appGlobal.history.location.hash.replace('#', '');
      if (TopicTabIds.includes(key as any)) return key as TopicTabId;

      // use settings (last visited tab)
      // biome-ignore lint/style/noNonNullAssertion: not touching to avoid breaking code during migration
      key = uiSettings.topicDetailsActiveTabKey!;
      if (TopicTabIds.includes(key as any)) return key as TopicTabId;

      // default to partitions
      return 'messages';
    }

    // 1. calculate what tab is selected as usual: url -> settings -> default
    // 2. if that tab is enabled, return it, otherwise return the first one that is not
    //    (todo: should probably show some message if all tabs are disabled...)
    const id = computeTabId();
    if (this.topicTabs.first((t) => t.id === id)?.isEnabled) return id;
    return this.topicTabs.first((t) => t?.isEnabled)?.id ?? 'messages';
  }

  componentDidMount() {
    // fix anchor
    const anchor = `#${this.selectedTabId}`;
    const location = appGlobal.history.location;
    if (location.hash !== anchor) {
      location.hash = anchor;
      appGlobal.history.replace(location);
    }
  }

  render() {
    const topic = this.topic;
    if (topic === undefined) return DefaultSkeleton;
    if (topic == null) return this.topicNotFound();

    const topicConfig = this.topicConfig;

    setTimeout(() => topicConfig && this.addBaseFavs(topicConfig));

    const leaderLessPartitionIds = (api.clusterHealth?.leaderlessPartitions ?? []).find(
      ({ topicName }) => topicName === this.props.topicName,
    )?.partitionIds;
    const underReplicatedPartitionIds = (api.clusterHealth?.underReplicatedPartitions ?? []).find(
      ({ topicName }) => topicName === this.props.topicName,
    )?.partitionIds;

    this.topicTabs = [
      new TopicTab(
        () => topic,
        'messages',
        'viewMessages',
        'Messages',
        (t) => <TopicMessageView topic={t} refreshTopicData={(force: boolean) => this.refreshData(force)} />,
      ),
      new TopicTab(
        () => topic,
        'consumers',
        'viewConsumers',
        'Consumers',
        (t) => <TopicConsumers topic={t} />,
      ),
      new TopicTab(
        () => topic,
        'partitions',
        'viewPartitions',
        <Flex gap={1}>
          Partitions
          {!!leaderLessPartitionIds && (
            <Tooltip
              placement="top"
              hasArrow
              label={`This topic has ${leaderLessPartitionIds.length} ${leaderLessPartitionIds.length === 1 ? 'a leaderless partition' : 'leaderless partitions'}`}
            >
              <Box>
                <MdError size={18} color={colors.brandError} />
              </Box>
            </Tooltip>
          )}
          {!!underReplicatedPartitionIds && (
            <Tooltip
              placement="top"
              hasArrow
              label={`This topic has ${underReplicatedPartitionIds.length} ${underReplicatedPartitionIds.length === 1 ? 'an under-replicated partition' : 'under-replicated partitions'}`}
            >
              <Box>
                <MdOutlineWarning size={18} color={colors.brandWarning} />
              </Box>
            </Tooltip>
          )}
        </Flex>,
        (t) => <TopicPartitions topic={t} />,
      ),
      new TopicTab(
        () => topic,
        'configuration',
        'viewConfig',
        'Configuration',
        (t) => <TopicConfiguration topic={t} />,
      ),
      new TopicTab(
        () => topic,
        'topicacl',
        'seeTopic',
        'ACL',
        (t) => {
          return <AclList acl={api.topicAcls.get(t.topicName)} />;
        },
        [
          () => {
            if (AppFeatures.SINGLE_SIGN_ON)
              if (api.userData != null && !api.userData.canListAcls)
                return (
                  <Popover
                    content={"You need the cluster-permission 'viewAcl' to view this tab"}
                    hideCloseButton={true}
                  >
                    <div>
                      {' '}
                      <LockIcon size={16} /> ACL
                    </div>
                  </Popover>
                );
            return undefined;
          },
        ],
      ),
      new TopicTab(
        () => topic,
        'documentation',
        'seeTopic',
        'Documentation',
        (t) => <TopicDocumentation topic={t} />,
        [
          (t) => (t.documentation === 'NOT_CONFIGURED' ? mkDocuTip('Topic documentation is not configured') : null),
          (t) =>
            t.documentation === 'NOT_EXISTENT'
              ? mkDocuTip('Documentation for this topic was not found in the configured repository', warnIcon)
              : null,
        ],
      ),
    ];

    return (
      <>
        <PageContent key={'b'}>
          {uiSettings.topicDetailsShowStatisticsBar && <TopicQuickInfoStatistic topic={topic} />}

          <Flex mb={4} gap={2}>
            <Button
              variant="outline"
              onClick={() => {
                appGlobal.history.push(`/topics/${encodeURIComponent(topic.topicName)}/produce-record`);
              }}
            >
              Produce Record
            </Button>
            {DeleteRecordsMenuItem(topic.cleanupPolicy === 'compact', topic.allowedActions ?? [], () => {
              return (this.deleteRecordsModalAlive = true);
            })}
          </Flex>

          {/* Tabs:  Messages, Configuration */}
          <Section>
            <Tabs
              isFitted
              tabs={this.topicTabs.map(({ id, title, content, isDisabled }) => ({
                key: id,
                disabled: isDisabled,
                title,
                content,
              }))}
              onChange={this.setTabPage}
              selectedTabKey={this.selectedTabId}
            />
          </Section>
        </PageContent>
        {this.deleteRecordsModalAlive && (
          <DeleteRecordsModal
            topic={topic}
            visible
            onCancel={() => (this.deleteRecordsModalAlive = false)}
            onFinish={() => {
              this.deleteRecordsModalAlive = false;
              this.refreshData(true);
              appGlobal.searchMessagesFunc?.('manual');
            }}
            afterClose={() => (this.deleteRecordsModalAlive = false)}
          />
        )}
      </>
    );
  }

  // depending on the cleanupPolicy we want to show specific config settings at the top
  addBaseFavs(topicConfig: ConfigEntry[]): void {
    const cleanupPolicy = topicConfig.find((e) => e.name === 'cleanup.policy')?.value;
    const favs = uiState.topicSettings.favConfigEntries;

    switch (cleanupPolicy) {
      case 'delete':
        favs.pushDistinct('retention.ms', 'retention.bytes');
        break;
      case 'compact':
        favs.pushDistinct('min.cleanable.dirty.ratio', 'delete.retention.ms');
        break;
      case 'compact,delete':
        favs.pushDistinct('retention.ms', 'retention.bytes', 'min.cleanable.dirty.ratio', 'delete.retention.ms');
        break;
    }
  }

  setTabPage = (activeKey: string): void => {
    uiSettings.topicDetailsActiveTabKey = activeKey as any;

    const loc = appGlobal.history.location;
    loc.hash = String(activeKey);
    appGlobal.history.replace(loc);

    this.refreshData(false);
  };

  topicNotFound() {
    const name = this.props.topicName;
    return (
      <Result
        status={404}
        title="404"
        userMessage={
          <div>
            The topic <Code>{name}</Code> does not exist.
          </div>
        }
        extra={
          <Button variant="solid" onClick={() => appGlobal.history.goBack()}>
            Go Back
          </Button>
        }
      />
    );
  }
}

export default TopicDetails;
