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

import { CheckIcon, CircleSlashIcon, EyeClosedIcon } from '@primer/octicons-react';
import {
  Alert,
  AlertDialog,
  AlertDialogBody,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogOverlay,
  AlertIcon,
  Box,
  Button,
  Checkbox,
  CopyButton,
  DataTable,
  Flex,
  Grid,
  Icon,
  Popover,
  SearchField,
  Text,
  Tooltip,
  useToast,
} from '@redpanda-data/ui';
import { AnimatePresence, motion } from 'framer-motion';
import { useQueryStateWithCallback } from 'hooks/use-query-state-with-callback';
import { observable } from 'mobx';
import { parseAsBoolean, parseAsString, useQueryState } from 'nuqs';
import React, { type FC, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { HiOutlineTrash } from 'react-icons/hi';
import { MdError, MdOutlineWarning } from 'react-icons/md';
import { useCreateTopicMutation, useLegacyListTopicsQuery } from 'react-query/api/topic';
import { Link } from 'react-router-dom';

import { CreateTopicModalContent, type CreateTopicModalState } from './CreateTopicModal/create-topic-modal';
import colors from '../../../colors';
import usePaginationParams from '../../../hooks/use-pagination-params';
import { api } from '../../../state/backend-api';
import { type Topic, TopicActions, type TopicConfigEntry } from '../../../state/rest-interfaces';
import { uiSettings } from '../../../state/ui';
import { uiState } from '../../../state/ui-state';
import createAutoModal from '../../../utils/create-auto-modal';
import { onPaginationChange } from '../../../utils/pagination';
import { editQuery } from '../../../utils/query-helper';
import type { RetentionSizeUnit, RetentionTimeUnit } from '../../../utils/topic-utils';
import { Code, DefaultSkeleton, QuickTable } from '../../../utils/tsx-utils';
import { renderLogDirSummary } from '../../misc/common';
import PageContent from '../../misc/page-content';
import Section from '../../misc/section';
import { Statistic } from '../../misc/statistic';

// Regex for quick search filtering
const QUICK_SEARCH_REGEX_CACHE = new Map<string, RegExp>();

const TopicList: FC = () => {
  useEffect(() => {
    uiState.pageBreadcrumbs = [{ title: 'Topics', linkTo: '' }];
  }, []);

  const [localSearchValue, setLocalSearchValue] = useQueryState('q', parseAsString.withDefault(''));

  const [showInternalTopics, setShowInternalTopics] = useQueryStateWithCallback<boolean>(
    {
      onUpdate: (val) => {
        uiSettings.topicList.hideInternalTopics = val;
      },
      getDefaultValue: () => uiSettings.topicList.hideInternalTopics,
    },
    'showInternal',
    parseAsBoolean
  );

  const { data, isLoading, isError, refetch: refetchTopics } = useLegacyListTopicsQuery();
  const [topicToDelete, setTopicToDelete] = useState<Topic | null>(null);
  const { mutateAsync: createTopic } = useCreateTopicMutation();
  const { Component: CreateTopicModal, show: showCreateTopicModal } = useMemo(
    () => makeCreateTopicModal(createTopic),
    [createTopic]
  );

  const refreshData = useCallback(() => {
    api.refreshClusterOverview();
    api.refreshClusterHealth().catch(() => {
      // Error handling managed by API layer
    });

    refetchTopics();
  }, [refetchTopics]);

  const topics = useMemo(() => {
    let filteredTopics = data.topics ?? [];
    if (!showInternalTopics) {
      filteredTopics = filteredTopics.filter((x) => !(x.isInternal || x.topicName.startsWith('_')));
    }

    const searchQuery = localSearchValue;
    if (searchQuery) {
      try {
        let quickSearchRegExp = QUICK_SEARCH_REGEX_CACHE.get(searchQuery);
        if (!quickSearchRegExp) {
          quickSearchRegExp = new RegExp(searchQuery, 'i');
          QUICK_SEARCH_REGEX_CACHE.set(searchQuery, quickSearchRegExp);
        }
        filteredTopics = filteredTopics.filter((topic) => Boolean(topic.topicName.match(quickSearchRegExp)));
      } catch (_e) {
        // biome-ignore lint/suspicious/noConsole: intentional console usage
        console.warn('Invalid expression');
        const searchLower = searchQuery.toLowerCase();
        filteredTopics = filteredTopics.filter((topic) => topic.topicName.toLowerCase().includes(searchLower));
      }
    }

    return filteredTopics;
  }, [data.topics, showInternalTopics, localSearchValue]);

  const statistics = useMemo(() => {
    const partitionCount = topics.sum((x) => x.partitionCount);
    const replicaCount = topics.sum((x) => x.partitionCount * x.replicationFactor);

    return {
      partitionCount,
      replicaCount,
      topicCount: topics.length,
    };
  }, [topics]);

  if (isLoading) {
    return DefaultSkeleton;
  }

  if (isError) {
    return <div>Error</div>;
  }

  return (
    <PageContent>
      <Section>
        <Flex>
          <Statistic title="Total topics" value={statistics.topicCount} />
          <Statistic title="Total partitions" value={statistics.partitionCount} />
          <Statistic title="Total replicas" value={statistics.replicaCount} />
        </Flex>
      </Section>

      <Box pt={6}>
        <Flex gap={2}>
          <SearchField
            placeholderText="Enter search term/regex"
            searchText={localSearchValue}
            setSearchText={setLocalSearchValue}
            width="350px"
          />
          <AnimatePresence>
            {localSearchValue && (
              <motion.div
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                initial={{ opacity: 0 }}
                style={{ display: 'flex', alignItems: 'center' }}
                transition={{ duration: 0.12 }}
              >
                <Text alignSelf="center" lineHeight="1" ml={4} whiteSpace="nowrap">
                  <Text display="inline" fontWeight="bold">
                    {topics.length}
                  </Text>{' '}
                  {topics.length === 1 ? 'result' : 'results'}
                </Text>
              </motion.div>
            )}
          </AnimatePresence>
        </Flex>
      </Box>
      <Section>
        <div className="flex items-center justify-between gap-4">
          <Button
            className="min-w-[160px]"
            colorScheme="brand"
            data-testid="create-topic-button"
            onClick={() => showCreateTopicModal()}
            variant="solid"
          >
            Create topic
          </Button>

          <Checkbox
            data-testid="show-internal-topics-checkbox"
            isChecked={showInternalTopics}
            onChange={(x) => {
              setShowInternalTopics(x.target.checked);
            }}
          >
            Show internal topics
          </Checkbox>

          <CreateTopicModal />
        </div>
        <Box my={4}>
          <TopicsTable
            onDelete={(record) => {
              setTopicToDelete(record);
            }}
            topics={topics}
          />
        </Box>
      </Section>

      <ConfirmDeletionModal
        onCancel={() => setTopicToDelete(null)}
        onFinish={async () => {
          setTopicToDelete(null);
          await refreshData();
        }}
        topicToDelete={topicToDelete}
      />
    </PageContent>
  );
};

const TopicsTable: FC<{ topics: Topic[]; onDelete: (record: Topic) => void }> = ({ topics, onDelete }) => {
  const paginationParams = usePaginationParams(topics.length, uiSettings.topicList.pageSize);

  return (
    <DataTable<Topic>
      columns={[
        {
          header: 'Name',
          accessorKey: 'topicName',
          cell: ({ row: { original: topic } }) => {
            const leaderLessPartitions = (api.clusterHealth?.leaderlessPartitions ?? []).find(
              ({ topicName }) => topicName === topic.topicName
            )?.partitionIds;
            const underReplicatedPartitions = (api.clusterHealth?.underReplicatedPartitions ?? []).find(
              ({ topicName }) => topicName === topic.topicName
            )?.partitionIds;

            return (
              <Flex alignItems="center" gap={2} whiteSpace="break-spaces" wordBreak="break-word">
                <Link to={`/topics/${encodeURIComponent(topic.topicName)}`}>{renderName(topic)}</Link>
                {!!leaderLessPartitions && (
                  <Tooltip
                    hasArrow
                    label={`This topic has ${leaderLessPartitions.length} ${leaderLessPartitions.length === 1 ? 'a leaderless partition' : 'leaderless partitions'}`}
                    placement="top"
                  >
                    <Box>
                      <MdError color={colors.brandError} size={18} />
                    </Box>
                  </Tooltip>
                )}
                {!!underReplicatedPartitions && (
                  <Tooltip
                    hasArrow
                    label={`This topic has ${underReplicatedPartitions.length} ${underReplicatedPartitions.length === 1 ? 'an under-replicated partition' : 'under-replicated partitions'}`}
                    placement="top"
                  >
                    <Box>
                      <MdOutlineWarning color={colors.brandWarning} size={18} />
                    </Box>
                  </Tooltip>
                )}
              </Flex>
            );
          },
          size: Number.POSITIVE_INFINITY,
        },
        {
          header: 'Partitions',
          accessorKey: 'partitionCount',
          enableResizing: true,
          cell: ({ row: { original: topic } }) => topic.partitionCount,
        },
        {
          header: 'Replicas',
          accessorKey: 'replicationFactor',
        },
        {
          header: 'CleanupPolicy',
          accessorKey: 'cleanupPolicy',
        },
        {
          header: 'Size',
          accessorKey: 'logDirSummary.totalSizeBytes',
          cell: ({ row: { original: topic } }) => renderLogDirSummary(topic.logDirSummary),
        },
        {
          id: 'action',
          header: '',
          cell: ({ row: { original: record } }) => (
            <Flex gap={1}>
              <DeleteDisabledTooltip topic={record}>
                <button
                  data-testid={`delete-topic-button-${record.topicName}`}
                  onClick={(event) => {
                    event.stopPropagation();
                    onDelete(record);
                  }}
                  type="button"
                >
                  <Icon as={HiOutlineTrash} />
                </button>
              </DeleteDisabledTooltip>
            </Flex>
          ),
        },
      ]}
      data={topics}
      onPaginationChange={onPaginationChange(paginationParams, ({ pageSize, pageIndex }) => {
        uiSettings.topicList.pageSize = pageSize;
        editQuery((query) => {
          query.page = String(pageIndex);
          query.pageSize = String(pageSize);
        });
      })}
      pagination={paginationParams}
      sorting={true}
    />
  );
};

const iconAllowed = (
  <span style={{ color: 'green' }}>
    <CheckIcon size={16} />
  </span>
);
const iconForbidden = (
  <span style={{ color: '#ca000a' }}>
    <CircleSlashIcon size={15} />
  </span>
);
const iconClosedEye = (
  <span style={{ color: '#0008', paddingLeft: '4px', transform: 'translateY(-1px)', display: 'inline-block' }}>
    <EyeClosedIcon size={14} verticalAlign="middle" />
  </span>
);

const renderName = (topic: Topic) => {
  const actions = topic.allowedActions;

  if (!actions || actions[0] === 'all') {
    return topic.topicName; // happens in non-business version
  }

  let missing = 0;
  for (const a of TopicActions) {
    if (!actions.includes(a)) {
      missing++;
    }
  }

  if (missing === 0) {
    return topic.topicName; // everything is allowed
  }

  // There's at least one action the user can't do
  // Show a table of what they can't do
  const popoverContent = (
    <div>
      <div style={{ marginBottom: '1em' }}>
        You're missing permissions to view
        <br />
        one more aspects of this topic.
      </div>
      {QuickTable(
        TopicActions.map((a) => ({
          key: a,
          value: actions.includes(a) ? iconAllowed : iconForbidden,
        })),
        {
          gapWidth: '6px',
          gapHeight: '2px',
          keyAlign: 'right',
          keyStyle: { fontSize: '86%', fontWeight: 700, textTransform: 'capitalize' },
          tableStyle: { margin: 'auto' },
        }
      )}
    </div>
  );

  return (
    <Box whiteSpace="break-spaces" wordBreak="break-word">
      <Popover closeDelay={10} content={popoverContent} hideCloseButton placement="right" size="stretch">
        <span>
          {topic.topicName}
          {iconClosedEye}
        </span>
      </Popover>
    </Box>
  );
};

function ConfirmDeletionModal({
  topicToDelete,
  onFinish,
  onCancel,
}: {
  topicToDelete: Topic | null;
  onFinish: () => void;
  onCancel: () => void;
}) {
  const [deletionPending, setDeletionPending] = useState(false);
  const [error, setError] = useState<string | Error | null>(null);
  const toast = useToast();
  const cancelRef = useRef<HTMLButtonElement | null>(null);

  const cleanup = () => {
    setDeletionPending(false);
    setError(null);
  };

  const finish = () => {
    onFinish();
    cleanup();

    toast({
      title: 'Topic Deleted',
      description: (
        <Text as="span">
          Topic <Code>{topicToDelete?.topicName}</Code> deleted successfully
        </Text>
      ),
      status: 'success',
    });
  };

  const cancel = () => {
    onCancel();
    cleanup();
  };

  return (
    <AlertDialog isOpen={topicToDelete !== null} leastDestructiveRef={cancelRef} onClose={cancel}>
      <AlertDialogOverlay>
        <AlertDialogContent>
          <AlertDialogHeader>Delete Topic</AlertDialogHeader>

          <AlertDialogBody>
            {error && (
              <Alert mb={2} status="error">
                <AlertIcon />
                {`An error occurred: ${typeof error === 'string' ? error : error.message}`}
              </Alert>
            )}
            {topicToDelete?.isInternal && (
              <Alert mb={2} status="error">
                <AlertIcon />
                This is an internal topic, deleting it might have unintended side-effects!
              </Alert>
            )}
            <Text>
              Are you sure you want to delete topic <Code>{topicToDelete?.topicName}</Code>?<br />
              This action cannot be undone.
            </Text>
          </AlertDialogBody>

          <AlertDialogFooter>
            <Button onClick={cancel} ref={cancelRef} variant="ghost">
              Cancel
            </Button>
            <Button
              colorScheme="brand"
              data-testid="delete-topic-confirm-button"
              isLoading={deletionPending}
              ml={3}
              onClick={() => {
                if (topicToDelete?.topicName) {
                  setDeletionPending(true);
                  api
                    .deleteTopic(topicToDelete?.topicName)
                    .then(finish)
                    .catch((err) => {
                      toast({
                        title: 'Failed to delete topic',
                        description: <Text as="span">{err.message}</Text>,
                        status: 'error',
                      });
                    })
                    .finally(() => {
                      setDeletionPending(false);
                    });
                }
              }}
            >
              Delete
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialogOverlay>
    </AlertDialog>
  );
}

function DeleteDisabledTooltip(props: { topic: Topic; children: JSX.Element }): JSX.Element {
  const deleteButton = props.children;

  const wrap = (button: JSX.Element, message: string) => (
    <Tooltip hasArrow label={message} placement="left">
      {React.cloneElement(button, {
        disabled: true,
        className: `${button.props.className ?? ''} disabled`,
        onClick: undefined,
      })}
    </Tooltip>
  );

  return (
    <>
      {hasDeletePrivilege()
        ? deleteButton
        : wrap(deleteButton, "You don't have 'deleteTopic' permission for this topic.")}
    </>
  );
}

function hasDeletePrivilege() {
  // TODO - we will provide ACL for this
  return true;
}

// Regex for validating topic names
const TOPIC_NAME_REGEX = /^\S+$/;

function makeCreateTopicModal(createTopic: ReturnType<typeof useCreateTopicMutation>['mutateAsync']) {
  api.refreshCluster(); // get brokers (includes configs) to display default values
  const tryGetBrokerConfig = (configName: string): string | undefined =>
    api.clusterInfo?.brokers?.find((_) => true)?.config.configs?.find((x) => x.name === configName)?.value ?? undefined;

  const getRetentionTimeFinalValue = (value: number | undefined, unit: RetentionTimeUnit) => {
    if (unit === 'default') {
      return;
    }

    if (value === undefined) {
      throw new Error(`unexpected: value for retention time is 'undefined' but unit is set to ${unit}`);
    }

    if (unit === 'ms') {
      return value;
    }
    if (unit === 'seconds') {
      return value * 1000;
    }
    if (unit === 'minutes') {
      return value * 1000 * 60;
    }
    if (unit === 'hours') {
      return value * 1000 * 60 * 60;
    }
    if (unit === 'days') {
      return value * 1000 * 60 * 60 * 24;
    }
    if (unit === 'months') {
      return value * 1000 * 60 * 60 * 24 * (365 / 12);
    }
    if (unit === 'years') {
      return value * 1000 * 60 * 60 * 24 * 365;
    }

    if (unit === 'infinite') {
      return -1;
    }
  };
  const getRetentionSizeFinalValue = (value: number | undefined, unit: RetentionSizeUnit) => {
    if (unit === 'default') {
      return;
    }

    if (value === undefined) {
      throw new Error(`unexpected: value for retention size is 'undefined' but unit is set to ${unit}`);
    }

    if (unit === 'Bit') {
      return value;
    }
    if (unit === 'KiB') {
      return value * 1024;
    }
    if (unit === 'MiB') {
      return value * 1024 * 1024;
    }
    if (unit === 'GiB') {
      return value * 1024 * 1024 * 1024;
    }
    if (unit === 'TiB') {
      return value * 1024 * 1024 * 1024 * 1024;
    }

    if (unit === 'infinite') {
      return -1;
    }
  };

  return createAutoModal<void, CreateTopicModalState>({
    modalProps: {
      title: 'Create Topic',
      style: {
        width: '80%',
        minWidth: '600px',
        maxWidth: '1000px',
        top: '50px',
        paddingTop: '10px',
        paddingBottom: '10px',
      },

      okText: 'Create',
      successTitle: 'Topic created!',

      closable: false,
      keyboard: false,
      maskClosable: false,
    },
    onCreate: () =>
      observable({
        topicName: '',

        // todo: get 'log.retention.bytes' and 'log.retention.ms' from any broker and show it for "default"

        retentionTimeMs: 1,
        retentionTimeUnit: 'default',

        retentionSize: 1,
        retentionSizeUnit: 'default',

        partitions: undefined,
        cleanupPolicy: 'delete',
        minInSyncReplicas: undefined,
        replicationFactor: undefined,

        additionalConfig: [{ name: '', value: '' }],

        defaults: {
          get retentionTime() {
            return tryGetBrokerConfig('log.retention.ms');
          },
          get retentionBytes() {
            return tryGetBrokerConfig('log.retention.bytes');
          },
          get replicationFactor() {
            return tryGetBrokerConfig('default.replication.factor');
          },
          get partitions() {
            return tryGetBrokerConfig('num.partitions');
          },
          get cleanupPolicy() {
            return tryGetBrokerConfig('log.cleanup.policy');
          },
          get minInSyncReplicas() {
            return '1'; // todo, what is the name of the default value? is it the same for apache and redpanda?
          },
        },
        hasErrors: false,
      }),
    isOkEnabled: (state) => TOPIC_NAME_REGEX.test(state.topicName) && !state.hasErrors,
    onOk: async (state) => {
      if (!state.topicName) {
        throw new Error('"Topic Name" must be set');
      }
      if (!state.cleanupPolicy) {
        throw new Error('"Cleanup Policy" must be set');
      }

      const config: TopicConfigEntry[] = [];
      const setVal = (name: string, value: string | number | undefined) => {
        if (value === undefined) {
          return;
        }
        config.removeAll((x) => x.name === name);
        config.push({ name, value: String(value) });
      };

      for (const x of state.additionalConfig) {
        setVal(x.name, x.value);
      }

      if (state.retentionTimeUnit !== 'default') {
        setVal('retention.ms', getRetentionTimeFinalValue(state.retentionTimeMs, state.retentionTimeUnit));
      }
      if (state.retentionSizeUnit !== 'default') {
        setVal('retention.bytes', getRetentionSizeFinalValue(state.retentionSize, state.retentionSizeUnit));
      }
      if (state.minInSyncReplicas !== undefined) {
        setVal('min.insync.replicas', state.minInSyncReplicas);
      }

      setVal('cleanup.policy', state.cleanupPolicy);

      const result = await createTopic({
        topic: {
          name: state.topicName,
          partitionCount: state.partitions ?? Number(state.defaults.partitions ?? '-1'),
          replicationFactor: state.replicationFactor ?? Number(state.defaults.replicationFactor ?? '-1'),
          configs: config.filter((x) => x.name.length > 0).map((x) => ({ name: x.name, value: x.value })),
        },
        validateOnly: false,
      });

      return (
        <Grid
          alignItems="center"
          columnGap={2}
          justifyContent="center"
          justifyItems="flex-end"
          py={2}
          rowGap={1}
          templateColumns="auto auto"
        >
          <Text>Name:</Text>
          <Flex alignItems="center" gap={2} justifySelf="start">
            <Text noOfLines={1} whiteSpace="break-spaces" wordBreak="break-word">
              {result.topicName}
            </Text>
            <CopyButton content={result.topicName} variant="ghost" />
          </Flex>
          <Text>Partitions:</Text>
          <Text justifySelf="start">{String(result.partitionCount).replace('-1', '(Default)')}</Text>
          <Text>Replication Factor:</Text>
          <Text justifySelf="start">{String(result.replicationFactor).replace('-1', '(Default)')}</Text>
        </Grid>
      );
    },
    onSuccess: (_state, _result) => {
      api.refreshClusterOverview();
      api.refreshClusterHealth().catch(() => {
        // Error handling managed by API layer
      });
    },
    content: (state) => <CreateTopicModalContent state={state} />,
  });
}

export default TopicList;
