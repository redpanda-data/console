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

import React, { useState } from 'react';

import { appGlobal } from '../../../state/app-global';
import { api, useApiStoreHook } from '../../../state/backend-api';
import type { ConfigEntry, Topic, TopicAction } from '../../../state/rest-interfaces';
import { uiSettings } from '../../../state/ui';
import { uiState } from '../../../state/ui-state';
import '../../../utils/array-extensions';
import { ErrorIcon, LockIcon, WarningIcon } from 'components/icons';
import { Badge } from 'components/redpanda-ui/components/badge';
import { Button } from 'components/redpanda-ui/components/button';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from 'components/redpanda-ui/components/empty';
import { Popover, PopoverContent, PopoverTrigger } from 'components/redpanda-ui/components/popover';
import { Tabs, TabsContent, TabsList, TabsTrigger } from 'components/redpanda-ui/components/tabs';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from 'components/redpanda-ui/components/tooltip';

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
import { PageComponent, type PageInitHelper } from '../page';

const TopicTabIds = ['messages', 'consumers', 'partitions', 'configuration', 'documentation', 'topicacl'] as const;
export type TopicTabId = (typeof TopicTabIds)[number];

type TopicTabProps = {
  topic: Topic;
  id: TopicTabId;
  requiredPermission: TopicAction;
  titleText: React.ReactNode;
  disableHooks?: ((topic: Topic) => React.ReactNode | undefined)[];
  children: (topic: Topic) => React.ReactNode;
};

// Context controls whether TopicTab renders its trigger or its content panel.
// The same <TopicTab> elements are rendered twice — once inside <TabsList> and
// once outside — so each instance only renders the relevant part.
const TopicTabModeCtx = React.createContext<'trigger' | 'content'>('content');

const TopicTab: React.FC<TopicTabProps> = ({ topic, id, requiredPermission, titleText, disableHooks, children }) => {
  const mode = React.useContext(TopicTabModeCtx);

  let customTitle: React.ReactNode | undefined;
  if (disableHooks) {
    for (const h of disableHooks) {
      const result = h(topic);
      if (result) {
        customTitle = result;
        break;
      }
    }
  }

  const hasPermission =
    !topic.allowedActions || topic.allowedActions[0] === 'all' || topic.allowedActions.includes(requiredPermission);
  const isDisabled = !!customTitle || !hasPermission;

  const title =
    customTitle ??
    (hasPermission ? (
      titleText
    ) : (
      <Popover>
        <PopoverTrigger asChild>
          <div>
            <LockIcon size={16} /> {titleText}
          </div>
        </PopoverTrigger>
        <PopoverContent>{`You're missing the required permission '${requiredPermission}' to view this tab`}</PopoverContent>
      </Popover>
    ));

  if (mode === 'trigger') {
    return (
      <TabsTrigger
        className="text-base aria-disabled:cursor-not-allowed aria-disabled:opacity-50 data-[state=active]:text-foreground"
        disabled={isDisabled}
        value={id}
        variant="underline"
      >
        {title}
      </TabsTrigger>
    );
  }

  return (
    <TabsContent className="mt-4" tabIndex={-1} value={id}>
      {children(topic)}
    </TabsContent>
  );
};

const mkDocuTip = (text: string, icon?: JSX.Element) => (
  <TooltipProvider>
    <Tooltip>
      <TooltipTrigger asChild>
        <span>{icon ?? null}Documentation</span>
      </TooltipTrigger>
      <TooltipContent side="left">{text}</TooltipContent>
    </Tooltip>
  </TooltipProvider>
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
  const [deleteRecordsModalAlive, setDeleteRecordsModalAlive] = useState(false);

  // Derived: topicConfig
  const config = useApiStoreHook((s) => s.topicConfig.get(topicName));
  const topicAcls = useApiStoreHook((s) => s.topicAcls.get(topicName));
  const topicConfig: ConfigEntry[] | null | undefined =
    config === undefined ? undefined : config === null || config.error !== null ? null : config.configEntries;

  setTimeout(() => topicConfig && addBaseFavs(topicConfig));

  const modifiedConfigCount = topicConfig?.filter((e) => e.isExplicitlySet).length ?? 0;

  const leaderLessPartitionIds = (api.clusterHealth?.leaderlessPartitions ?? []).find(
    ({ topicName: tn }) => tn === topicName
  )?.partitionIds;
  const underReplicatedPartitionIds = (api.clusterHealth?.underReplicatedPartitions ?? []).find(
    ({ topicName: tn }) => tn === topicName
  )?.partitionIds;

  const aclDisableHooks: ((topic: Topic) => React.ReactNode | undefined)[] = [
    () => {
      if (
        AppFeatures.SINGLE_SIGN_ON &&
        api.userData !== null &&
        api.userData !== undefined &&
        !api.userData.canListAcls
      ) {
        return (
          <Popover>
            <PopoverTrigger asChild>
              <div>
                <LockIcon size={16} /> ACL
              </div>
            </PopoverTrigger>
            <PopoverContent>You need the cluster-permission &apos;viewAcl&apos; to view this tab</PopoverContent>
          </Popover>
        );
      }
    },
  ];

  const docuDisableHooks: ((topic: Topic) => React.ReactNode | undefined)[] = [
    (t) => (t.documentation === 'NOT_CONFIGURED' ? mkDocuTip('Topic documentation is not configured') : null),
    (t) =>
      t.documentation === 'NOT_EXISTENT'
        ? mkDocuTip('Documentation for this topic was not found in the configured repository', warnIcon)
        : null,
  ];

  const enabledTabIds = new Set<TopicTabId>(
    [
      isTopicTabEnabled(topic, 'viewMessages') && 'messages',
      isTopicTabEnabled(topic, 'viewConsumers') && 'consumers',
      isTopicTabEnabled(topic, 'viewPartitions') && 'partitions',
      isTopicTabEnabled(topic, 'viewConfig') && 'configuration',
      isTopicTabEnabled(topic, 'seeTopic', aclDisableHooks) && 'topicacl',
      !isServerless() && isTopicTabEnabled(topic, 'seeTopic', docuDisableHooks) && 'documentation',
    ].filter(Boolean) as TopicTabId[]
  );

  const selectedTabId = getSelectedTabId(enabledTabIds);

  const tabElements = (
    <>
      <TopicTab id="messages" requiredPermission="viewMessages" titleText="Messages" topic={topic}>
        {(t) => (
          <TopicMessageView refreshTopicData={(force: boolean) => refreshTopicData(topicName, force)} topic={t} />
        )}
      </TopicTab>
      <TopicTab id="consumers" requiredPermission="viewConsumers" titleText="Consumers" topic={topic}>
        {(t) => <TopicConsumers topic={t} />}
      </TopicTab>
      <TopicTab
        id="partitions"
        requiredPermission="viewPartitions"
        titleText={
          <div className="flex gap-1" key="partitions-title">
            Partitions
            {!!leaderLessPartitionIds && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div>
                      <ErrorIcon color={colors.brandError} size={18} />
                    </div>
                  </TooltipTrigger>
                  <TooltipContent side="top">
                    {`This topic has ${leaderLessPartitionIds.length} ${leaderLessPartitionIds.length === 1 ? 'a leaderless partition' : 'leaderless partitions'}`}
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
            {!!underReplicatedPartitionIds && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div>
                      <WarningIcon color={colors.brandWarning} size={18} />
                    </div>
                  </TooltipTrigger>
                  <TooltipContent side="top">
                    {`This topic has ${underReplicatedPartitionIds.length} ${underReplicatedPartitionIds.length === 1 ? 'an under-replicated partition' : 'under-replicated partitions'}`}
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
          </div>
        }
        topic={topic}
      >
        {(t) => <TopicPartitions topic={t} />}
      </TopicTab>
      <TopicTab
        id="configuration"
        requiredPermission="viewConfig"
        titleText={
          <span className="inline-flex items-center gap-2">
            Configuration
            {modifiedConfigCount > 0 ? (
              <Badge aria-label={`${modifiedConfigCount} modified`} size="sm" variant="info-inverted">
                {modifiedConfigCount}
              </Badge>
            ) : null}
          </span>
        }
        topic={topic}
      >
        {(t) => <TopicConfiguration topic={t} />}
      </TopicTab>
      <TopicTab
        disableHooks={aclDisableHooks}
        id="topicacl"
        requiredPermission="seeTopic"
        titleText="ACL"
        topic={topic}
      >
        {() => <AclList acl={topicAcls} />}
      </TopicTab>
      {!isServerless() && (
        <TopicTab
          disableHooks={docuDisableHooks}
          id="documentation"
          requiredPermission="seeTopic"
          titleText="Documentation"
          topic={topic}
        >
          {(t) => <TopicDocumentation topic={t} />}
        </TopicTab>
      )}
    </>
  );

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
        <div className="mb-4 flex flex-col gap-2 md:flex-row md:items-center">
          {Boolean(uiSettings.topicDetailsShowStatisticsBar) && <TopicQuickInfoStatistic topic={topic} />}
          <div className="flex shrink-0 items-center gap-2 md:ml-auto">
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
          </div>
        </div>

        <Tabs data-testid="topic-details-tabs" onValueChange={setTabPage} value={selectedTabId}>
          <TopicTabModeCtx.Provider value="trigger">
            <TabsList activeClassName="after:bg-foreground" className="w-fit" variant="underline">
              {tabElements}
            </TabsList>
          </TopicTabModeCtx.Provider>
          <TopicTabModeCtx.Provider value="content">{tabElements}</TopicTabModeCtx.Provider>
        </Tabs>
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

function isTopicTabEnabled(
  topic: Topic,
  requiredPermission: TopicAction,
  disableHooks?: ((topic: Topic) => React.ReactNode | undefined)[]
): boolean {
  if (disableHooks) {
    for (const h of disableHooks) {
      if (h(topic)) return false;
    }
  }
  return (
    !topic.allowedActions || topic.allowedActions[0] === 'all' || topic.allowedActions.includes(requiredPermission)
  );
}

function getSelectedTabId(enabledTabIds: Set<TopicTabId>): TopicTabId {
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

    return 'messages';
  }

  const id = computeTabId();
  if (enabledTabIds.has(id)) {
    return id;
  }
  return TopicTabIds.find((t) => enabledTabIds.has(t)) ?? 'messages';
}

function topicNotFound(name: string) {
  return (
    <Empty>
      <EmptyHeader>
        <EmptyTitle>404</EmptyTitle>
        <EmptyDescription>
          The topic <code className="font-mono">{name}</code> does not exist.
        </EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Button onClick={() => appGlobal.historyPush('/topics')} variant="primary">
          Go Back
        </Button>
      </EmptyContent>
    </Empty>
  );
}

export default TopicDetails;
