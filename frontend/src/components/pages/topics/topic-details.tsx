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

import React, { useState, useSyncExternalStore } from 'react';

import { appGlobal } from '../../../state/app-global';
import { api, useApiStore } from '../../../state/backend-api';
import type { ConfigEntry, Topic, TopicAction } from '../../../state/rest-interfaces';
import { uiSettings } from '../../../state/ui';
import { uiState } from '../../../state/ui-state';
import '../../../utils/array-extensions';
import { Box, Button, Code, Flex, Popover, Result, Tooltip } from '@redpanda-data/ui';
import { ErrorIcon, LockIcon, WarningIcon } from 'components/icons';

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
import { PageComponent, type PageInitHelper } from '../page';

const TopicTabIds = ['messages', 'consumers', 'partitions', 'configuration', 'documentation', 'topicacl'] as const;
export type TopicTabId = (typeof TopicTabIds)[number];

// A tab (specifying title+content) that disable/lock itself if the user doesn't have some required permissions.
class TopicTab {
  readonly topicGetter: () => Topic | undefined | null;
  id: TopicTabId;
  private readonly requiredPermission: TopicAction;
  titleText: React.ReactNode;
  private readonly contentFunc: (topic: Topic) => React.ReactNode;
  private readonly disableHooks?: ((topic: Topic) => React.ReactNode | undefined)[];

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

  get isEnabled(): boolean {
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

  get isDisabled(): boolean {
    return !this.isEnabled;
  }

  get title(): React.ReactNode {
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

  get content(): React.ReactNode {
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
    <WarningIcon />
  </span>
);

function refreshTopicData(topicName: string, force: boolean) {
  // must know what distribution we're working with; redpanda has some differences
  api.refreshClusterOverview();

  // there is no single endpoint to refresh a single topic
  api.refreshTopics(force);

  // Resolve the active tab: prefer the browser URL hash (window.location is always current,
  // unlike appGlobal.location which is synced asynchronously via RouterSync's useEffect),
  // fall back to stored setting.
  const urlHash = window.location.hash.replace('#', '') as TopicTabId;
  const activeTab = TopicTabIds.includes(urlHash) ? urlHash : uiSettings.topicDetailsActiveTabKey;

  // consumers are lazy loaded because they're (relatively) expensive
  if (activeTab === 'consumers') {
    api.refreshTopicConsumers(topicName, force);
  }

  // partitions are required for the Partitions tab
  api.refreshPartitionsForTopic(topicName, force);

  // configuration is always required for the statistics bar
  api.refreshTopicConfig(topicName, force);

  api.refreshClusterHealth().catch(() => {
    // Error handling managed by API layer
  });

  // documentation can be lazy loaded
  if (activeTab === 'documentation') {
    api.refreshTopicDocumentation(topicName, force);
  }

  // ACL can be lazy loaded
  if (activeTab === 'topicacl') {
    api.refreshTopicAcls(topicName, force);
  }
}

class TopicDetails extends PageComponent<{ topicName: string }> {
  initPage(p: PageInitHelper): void {
    const topicName = this.props.topicName;
    uiState.currentTopicName = topicName;

    refreshTopicData(topicName, true);
    appGlobal.onRefresh = () => refreshTopicData(topicName, true);

    p.title = topicName;
    p.addBreadcrumb('Topics', '/topics');
    p.addBreadcrumb(topicName, `/topics/${topicName}`, undefined, {
      canBeCopied: true,
      canBeTruncated: true,
    });
  }

  render() {
    const { topicName } = this.props;
    // Read api.topics in the class render so PageComponent's forceUpdate() re-evaluates
    // the loading state when the Zustand store delivers topics data.
    if (!api.topics) {
      return DefaultSkeleton;
    }
    const topic = api.topics.find((e) => e.topicName === topicName);
    if (!topic) {
      return topicNotFound(topicName);
    }
    return <TopicDetailsContent topic={topic} topicName={topicName} />;
  }
}

const TopicDetailsContent = ({ topic, topicName }: { topic: Topic; topicName: string }) => {
  useSyncExternalStore(useApiStore.subscribe, useApiStore.getState);

  const [deleteRecordsModalAlive, setDeleteRecordsModalAlive] = useState(false);

  // Derived: topicConfig
  const config = api.topicConfig.get(topicName);
  const topicConfig: ConfigEntry[] | null | undefined =
    config === undefined ? undefined : config === null || config.error !== null ? null : config.configEntries;

  setTimeout(() => topicConfig && addBaseFavs(topicConfig));

  const leaderLessPartitionIds = (api.clusterHealth?.leaderlessPartitions ?? []).find(
    ({ topicName: tn }) => tn === topicName
  )?.partitionIds;
  const underReplicatedPartitionIds = (api.clusterHealth?.underReplicatedPartitions ?? []).find(
    ({ topicName: tn }) => tn === topicName
  )?.partitionIds;

  const topicTabs: TopicTab[] = [
    new TopicTab(
      () => topic,
      'messages',
      'viewMessages',
      'Messages',
      (t) => <TopicMessageView refreshTopicData={(force: boolean) => refreshTopicData(topicName, force)} topic={t} />
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
      <Flex gap={1} key="partitions-title">
        Partitions
        {!!leaderLessPartitionIds && (
          <Tooltip
            hasArrow
            label={`This topic has ${leaderLessPartitionIds.length} ${leaderLessPartitionIds.length === 1 ? 'a leaderless partition' : 'leaderless partitions'}`}
            placement="top"
          >
            <Box>
              <ErrorIcon color={colors.brandError} size={18} />
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
              <WarningIcon color={colors.brandWarning} size={18} />
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

  if (isServerless()) {
    topicTabs.splice(
      topicTabs.findIndex((t) => t.id === 'documentation'),
      1
    );
  }

  const selectedTabId = getSelectedTabId(topicTabs);

  const setTabPage = (activeKey: string): void => {
    uiSettings.topicDetailsActiveTabKey = activeKey as TopicTabId;

    const loc = appGlobal.location;
    loc.hash = String(activeKey);
    appGlobal.historyReplace(`${loc.pathname}#${loc.hash}`);

    refreshTopicData(topicName, false);
  };

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
            setDeleteRecordsModalAlive(true);
          })}
        </Flex>

        {/* Tabs:  Messages, Configuration */}
        <Section>
          <Tabs
            data-testid="topic-details-tabs"
            isFitted
            onChange={setTabPage}
            selectedTabKey={selectedTabId}
            tabs={topicTabs.map(({ id, title, content, isDisabled }) => ({
              key: id,
              disabled: isDisabled,
              title,
              content,
            }))}
          />
        </Section>
      </PageContent>
      {Boolean(deleteRecordsModalAlive) && (
        <DeleteRecordsModal
          afterClose={() => {
            setDeleteRecordsModalAlive(false);
          }}
          onCancel={() => {
            setDeleteRecordsModalAlive(false);
          }}
          onFinish={() => {
            setDeleteRecordsModalAlive(false);
            refreshTopicData(topicName, true);
            appGlobal.searchMessagesFunc?.('manual');
          }}
          topic={topic}
          visible
        />
      )}
    </>
  );
};

// depending on the cleanupPolicy we want to show specific config settings at the top
function addBaseFavs(topicConfig: ConfigEntry[]): void {
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

function getSelectedTabId(topicTabs: TopicTab[]): TopicTabId {
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

  const id = computeTabId();
  if (topicTabs.first((t) => t.id === id)?.isEnabled) {
    return id;
  }
  return topicTabs.first((t) => t?.isEnabled)?.id ?? 'messages';
}

function topicNotFound(name: string) {
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

export default TopicDetails;
