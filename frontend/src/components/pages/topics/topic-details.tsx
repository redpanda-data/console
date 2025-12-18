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

import { appGlobal } from '../../../state/app-global';
import { api } from '../../../state/backend-api';
import type { ConfigEntry, Topic, TopicAction } from '../../../state/rest-interfaces';
import { uiSettings } from '../../../state/ui';
import { uiState } from '../../../state/ui-state';
import '../../../utils/array-extensions';
import { LockIcon } from '@primer/octicons-react';
import { Box, Button, Code, Flex, Popover, Result, Tooltip } from '@redpanda-data/ui';
import { MdError, MdOutlineWarning, MdOutlineWarningAmber } from 'react-icons/md';

import DeleteRecordsModal from './DeleteRecordsModal/delete-records-modal';
import { TopicQuickInfoStatistic } from './quick-info';
import AclList from './Tab.Acl/acl-list';
import { TopicMessageView } from './Tab.Messages';
import { DeleteRecordsMenuItem } from './Tab.Messages/common/delete-records-menu-item';
import { TopicConfiguration } from './tab-config';
import { TopicConsumers } from './tab-consumers';
import { TopicDocumentation } from './tab-docu';
import { TopicPartitions } from './tab-partitions';
import colors from '../../../colors';
import { isServerless } from '../../../config';
import { AppFeatures } from '../../../utils/env';
import { DefaultSkeleton } from '../../../utils/tsx-utils';
import PageContent from '../../misc/page-content';
import Section from '../../misc/section';
import Tabs from '../../misc/tabs/tabs';
import { PageComponent, type PageInitHelper, type PageProps } from '../page';

const TopicTabIds = ['messages', 'consumers', 'partitions', 'configuration', 'documentation', 'topicacl'] as const;
export type TopicTabId = (typeof TopicTabIds)[number];

// A tab (specifying title+content) that disable/lock itself if the user doesn't have some required permissions.
class TopicTab {
  readonly topicGetter: () => Topic | undefined | null;
  id: TopicTabId;
  private requiredPermission: TopicAction;
  titleText: React.ReactNode;
  private contentFunc: (topic: Topic) => React.ReactNode;
  private disableHooks?: ((topic: Topic) => React.ReactNode | undefined)[];

  // biome-ignore lint/nursery/useMaxParams: Legacy class with many constructor parameters
  constructor(
    topicGetter: () => Topic | undefined | null,
    id: TopicTabId,
    requiredPermission: TopicAction,
    titleText: React.ReactNode,
    contentFunc: (topic: Topic) => React.ReactNode,
    disableHooks?: ((topic: Topic) => React.ReactNode | undefined)[]
  ) {
    this.topicGetter = topicGetter;
    this.id = id;
    this.requiredPermission = requiredPermission;
    this.titleText = titleText;
    this.contentFunc = contentFunc;
    this.disableHooks = disableHooks;
  }

  @computed get isEnabled(): boolean {
    const topic = this.topicGetter();

    if (topic && this.disableHooks) {
      for (const h of this.disableHooks) {
        if (h(topic)) {
          return false;
        }
      }
    }

    if (!topic) {
      return true; // no data yet
    }
    if (!topic.allowedActions || topic.allowedActions[0] === 'all') {
      return true; // Redpanda Console free version
    }

    return topic.allowedActions.includes(this.requiredPermission);
  }

  @computed get isDisabled(): boolean {
    return !this.isEnabled;
  }

  @computed get title(): React.ReactNode {
    if (this.isEnabled) {
      return this.titleText;
    }

    const topic = this.topicGetter();
    if (topic && this.disableHooks) {
      for (const h of this.disableHooks) {
        const replacementTitle = h(topic);
        if (replacementTitle) {
          return replacementTitle;
        }
      }
    }

    return (
      <Popover
        content={`You're missing the required permission '${this.requiredPermission}' to view this tab`}
        hideCloseButton={true}
      >
        <div>
          <LockIcon size={16} /> {this.titleText}
        </div>
      </Popover>
    );
  }

  @computed get content(): React.ReactNode {
    const topic = this.topicGetter();
    if (topic) {
      return this.contentFunc(topic);
    }
    return null;
  }
}

const mkDocuTip = (text: string, icon?: JSX.Element) => (
  <Tooltip hasArrow label={text} placement="left">
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

  constructor(props: Readonly<PageProps<{ topicName: string }>>) {
    super(props);

    if (isServerless()) {
      this.topicTabs.removeAll((x) => x.id === 'documentation');
    }

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
    api.refreshClusterOverview();

    // there is no single endpoint to refresh a single topic
    api.refreshTopics(force);

    // consumers are lazy loaded because they're (relatively) expensive
    if (uiSettings.topicDetailsActiveTabKey === 'consumers') {
      api.refreshTopicConsumers(this.props.topicName, force);
    }

    // partitions are always required to display message count in the statistics bar
    api.refreshPartitionsForTopic(this.props.topicName, force);

    // configuration is always required for the statistics bar
    api.refreshTopicConfig(this.props.topicName, force);

    api.refreshClusterHealth().catch(() => {
      // Error handling managed by API layer
    });

    // documentation can be lazy loaded
    if (uiSettings.topicDetailsActiveTabKey === 'documentation') {
      api.refreshTopicDocumentation(this.props.topicName, force);
    }

    // ACL can be lazy loaded
    if (uiSettings.topicDetailsActiveTabKey === 'topicacl') {
      api.refreshTopicAcls(this.props.topicName, force);
    }
  }

  @computed get topic(): undefined | Topic | null {
    // undefined = not yet known, null = known to be null
    if (!api.topics) {
      // biome-ignore lint/suspicious/useGetterReturn: early return for undefined case
      return;
    }
    const topic = api.topics.find((e) => e.topicName === this.props.topicName);
    return topic ?? null;
  }
  @computed get topicConfig(): undefined | ConfigEntry[] | null {
    const config = api.topicConfig.get(this.props.topicName);
    if (config === undefined) {
      // biome-ignore lint/suspicious/useGetterReturn: early return for undefined case
      return;
    }
    if (config === null || config.error !== null) {
      return null;
    }
    return config.configEntries;
  }

  get selectedTabId(): TopicTabId {
    function computeTabId() {
      // use url anchor if possible
      let key = appGlobal.location.hash.replace('#', '');
      if (TopicTabIds.includes(key as TopicTabId)) {
        return key as TopicTabId;
      }

      // use settings (last visited tab)
      // biome-ignore lint/style/noNonNullAssertion: not touching to avoid breaking code during migration
      key = uiSettings.topicDetailsActiveTabKey!;
      if (TopicTabIds.includes(key as TopicTabId)) {
        return key as TopicTabId;
      }

      // default to partitions
      return 'messages';
    }

    // 1. calculate what tab is selected as usual: url -> settings -> default
    // 2. if that tab is enabled, return it, otherwise return the first one that is not
    //    (todo: should probably show some message if all tabs are disabled...)
    const id = computeTabId();
    if (this.topicTabs.first((t) => t.id === id)?.isEnabled) {
      return id;
    }
    return this.topicTabs.first((t) => t?.isEnabled)?.id ?? 'messages';
  }

  render() {
    const topic = this.topic;
    if (topic === undefined) {
      return DefaultSkeleton;
    }
    if (topic === null) {
      return this.topicNotFound();
    }

    const topicConfig = this.topicConfig;

    setTimeout(() => topicConfig && this.addBaseFavs(topicConfig));

    const leaderLessPartitionIds = (api.clusterHealth?.leaderlessPartitions ?? []).find(
      ({ topicName }) => topicName === this.props.topicName
    )?.partitionIds;
    const underReplicatedPartitionIds = (api.clusterHealth?.underReplicatedPartitions ?? []).find(
      ({ topicName }) => topicName === this.props.topicName
    )?.partitionIds;

    this.topicTabs = [
      new TopicTab(
        () => topic,
        'messages',
        'viewMessages',
        'Messages',
        (t) => <TopicMessageView refreshTopicData={(force: boolean) => this.refreshData(force)} topic={t} />
      ),
      new TopicTab(
        () => topic,
        'consumers',
        'viewConsumers',
        'Consumers',
        (t) => <TopicConsumers topic={t} />
      ),
      new TopicTab(
        () => topic,
        'partitions',
        'viewPartitions',
        <Flex gap={1}>
          Partitions
          {!!leaderLessPartitionIds && (
            <Tooltip
              hasArrow
              label={`This topic has ${leaderLessPartitionIds.length} ${leaderLessPartitionIds.length === 1 ? 'a leaderless partition' : 'leaderless partitions'}`}
              placement="top"
            >
              <Box>
                <MdError color={colors.brandError} size={18} />
              </Box>
            </Tooltip>
          )}
          {!!underReplicatedPartitionIds && (
            <Tooltip
              hasArrow
              label={`This topic has ${underReplicatedPartitionIds.length} ${underReplicatedPartitionIds.length === 1 ? 'an under-replicated partition' : 'under-replicated partitions'}`}
              placement="top"
            >
              <Box>
                <MdOutlineWarning color={colors.brandWarning} size={18} />
              </Box>
            </Tooltip>
          )}
        </Flex>,
        (t) => <TopicPartitions topic={t} />
      ),
      new TopicTab(
        () => topic,
        'configuration',
        'viewConfig',
        'Configuration',
        (t) => <TopicConfiguration topic={t} />
      ),
      new TopicTab(
        () => topic,
        'topicacl',
        'seeTopic',
        'ACL',
        (t) => <AclList acl={api.topicAcls.get(t.topicName)} />,
        [
          () => {
            if (
              AppFeatures.SINGLE_SIGN_ON &&
              api.userData !== null &&
              api.userData !== undefined &&
              !api.userData.canListAcls
            ) {
              return (
                <Popover content={"You need the cluster-permission 'viewAcl' to view this tab"} hideCloseButton={true}>
                  <div>
                    {' '}
                    <LockIcon size={16} /> ACL
                  </div>
                </Popover>
              );
            }
            return;
          },
        ]
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
        ]
      ),
    ];

    return (
      <>
        <PageContent key={'b'}>
          {Boolean(uiSettings.topicDetailsShowStatisticsBar) && <TopicQuickInfoStatistic topic={topic} />}

          <Flex gap={2} mb={4}>
            <Button
              data-testid="produce-record-button"
              onClick={() => {
                appGlobal.historyPush(`/topics/${encodeURIComponent(topic.topicName)}/produce-record`);
              }}
              variant="outline"
            >
              Produce Record
            </Button>
            {DeleteRecordsMenuItem(topic.cleanupPolicy === 'compact', topic.allowedActions, () => {
              this.deleteRecordsModalAlive = true;
            })}
          </Flex>

          {/* Tabs:  Messages, Configuration */}
          <Section>
            <Tabs
              data-testid="topic-details-tabs"
              isFitted
              onChange={this.setTabPage}
              selectedTabKey={this.selectedTabId}
              tabs={this.topicTabs.map(({ id, title, content, isDisabled }) => ({
                key: id,
                disabled: isDisabled,
                title,
                content,
              }))}
            />
          </Section>
        </PageContent>
        {Boolean(this.deleteRecordsModalAlive) && (
          <DeleteRecordsModal
            afterClose={() => {
              this.deleteRecordsModalAlive = false;
            }}
            onCancel={() => {
              this.deleteRecordsModalAlive = false;
            }}
            onFinish={() => {
              this.deleteRecordsModalAlive = false;
              this.refreshData(true);
              appGlobal.searchMessagesFunc?.('manual');
            }}
            topic={topic}
            visible
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
      default:
        break;
    }
  }

  setTabPage = (activeKey: string): void => {
    uiSettings.topicDetailsActiveTabKey = activeKey as TopicTabId;

    const loc = appGlobal.location;
    loc.hash = String(activeKey);
    appGlobal.historyReplace(`${loc.pathname}#${loc.hash}`);

    this.refreshData(false);
  };

  topicNotFound() {
    const name = this.props.topicName;
    return (
      <Result
        extra={
          <Button onClick={() => appGlobal.historyPush('/topics')} variant="solid">
            Go Back
          </Button>
        }
        status={404}
        title="404"
        userMessage={
          <div>
            The topic <Code>{name}</Code> does not exist.
          </div>
        }
      />
    );
  }
}

export default TopicDetails;
