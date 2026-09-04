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

import { ChevronDownIcon, ChevronRightIcon, CloseIcon } from 'components/icons';
import { Button } from 'components/redpanda-ui/components/button';
import {
  DataTable,
  type DataTableColumnDef,
  DataTableColumnHeader,
} from 'components/redpanda-ui/components/data-table';
import { Input, InputEnd, InputStart } from 'components/redpanda-ui/components/input';
import { SearchIcon } from 'lucide-react';
import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { showToast } from 'utils/toast.utils';

import { openDeleteModal } from './modals';
import { PartitionStatus } from './transforms-list';
import usePaginationParams from '../../../hooks/use-pagination-params';
import { PayloadEncoding } from '../../../protogen/redpanda/api/console/v1alpha1/common_pb';
import {
  type PartitionTransformStatus,
  PartitionTransformStatus_PartitionStatus,
  type TransformMetadata,
} from '../../../protogen/redpanda/api/dataplane/v1/transform_pb';
import { appGlobal } from '../../../state/app-global';
import {
  api,
  createMessageSearch,
  type MessageSearch,
  type MessageSearchRequest,
  transformsApi,
} from '../../../state/backend-api';
import type { TopicMessage } from '../../../state/rest-interfaces';
import { PartitionOffsetOrigin } from '../../../state/ui';
import { sanitizeString } from '../../../utils/filter-helper';
import { DefaultSkeleton, QuickTable, TimestampDisplay } from '../../../utils/tsx-utils';
import { decodeURIComponentPercents, encodeBase64 } from '../../../utils/utils';
import PageContent from '../../misc/page-content';
import Section from '../../misc/section';
import Tabs from '../../misc/tabs/tabs';
import { PageComponent, type PageInitHelper } from '../page';
import { ExpandedMessage } from '../topics/Tab.Messages/message-display/expanded-message';
import { MessagePreview } from '../topics/Tab.Messages/message-display/message-preview';

class TransformDetails extends PageComponent<{ transformName: string }> {
  initPage(p: PageInitHelper): void {
    const transformName = decodeURIComponentPercents(this.props.transformName);
    p.title = transformName;
    p.addBreadcrumb('Transforms', '/transforms');
    p.addBreadcrumb(transformName, `/transforms/${transformName}`, undefined, {
      canBeCopied: true,
      canBeTruncated: true,
    });

    this.refreshData(true);
    appGlobal.onRefresh = () => this.refreshData(true);
  }

  refreshData(force: boolean) {
    transformsApi.refreshTransforms(force);
  }

  render() {
    if (!transformsApi.transforms) {
      return DefaultSkeleton;
    }
    if (transformsApi.transforms.length === 0) {
      appGlobal.historyReplace('/transforms-setup');
      return null;
    }

    const transformName = decodeURIComponentPercents(this.props.transformName);
    const transform = transformsApi.transformDetails.get(transformName);
    if (!transform) {
      return DefaultSkeleton;
    }

    return (
      <PageContent>
        <div>
          <Button
            className="mt-2"
            onClick={() =>
              openDeleteModal(transformName, () => {
                transformsApi
                  .deleteTransform(transformName)
                  .then(() => {
                    showToast({
                      status: 'success',
                      duration: 4000,
                      title: 'Transform deleted',
                    });
                    transformsApi.refreshTransforms(true);
                  })
                  .catch((err) => {
                    showToast({
                      status: 'error',
                      title: 'Failed to delete transform',
                      description: String(err),
                    });
                  });
              })
            }
            variant="destructive-outline"
          >
            Delete
          </Button>
        </div>

        <Tabs
          tabs={[
            { key: 'overview', title: <>Overview</>, content: <OverviewTab transform={transform} /> },
            { key: 'logs', title: <>Logs</>, content: <LogsTab transform={transform} /> },
          ]}
        />
      </PageContent>
    );
  }
}
export default TransformDetails;

const partitionStatusColumns: DataTableColumnDef<PartitionTransformStatus>[] = [
  { header: 'Partition', accessorKey: 'partitionId' },
  { header: 'Node', accessorKey: 'brokerId' },
  {
    id: 'status',
    header: 'Status',
    cell: ({ row: { original: r } }) => <PartitionStatus status={r.status} />,
  },
  { header: 'Lag', accessorKey: 'lag' },
];

const OverviewTab = (p: { transform: TransformMetadata }) => {
  let overallStatus = <></>;
  if (p.transform.statuses.all((x) => x.status === PartitionTransformStatus_PartitionStatus.RUNNING)) {
    overallStatus = <PartitionStatus status={PartitionTransformStatus_PartitionStatus.RUNNING} />;
  } else {
    // biome-ignore lint/style/noNonNullAssertion: not touching to avoid breaking code during migration
    const partitionTransformStatus = p.transform.statuses.first(
      (x) => x.status !== PartitionTransformStatus_PartitionStatus.RUNNING
    )!;
    overallStatus = <PartitionStatus status={partitionTransformStatus.status} />;
  }

  return (
    <>
      <div className="my-6">
        {QuickTable(
          [
            { key: 'Status', value: overallStatus },
            { key: 'Input topic', value: p.transform.inputTopicName },
            {
              key: 'Output topics',
              value: (
                <>
                  {p.transform.outputTopicNames
                    .map((x) => <Fragment key={x}>{x}</Fragment>)
                    .genericJoin(() => (
                      <br />
                    ))}
                </>
              ),
            },
            // { key: '', value: p.transform.environmentVariables }
          ],
          {
            keyStyle: { fontWeight: 600, verticalAlign: 'baseline' },
            keyAlign: 'left',
            gapHeight: '.5rem',
            gapWidth: '4rem',
          }
        )}
      </div>
      <div className="max-w-[35rem]">
        <DataTable<PartitionTransformStatus>
          columns={partitionStatusColumns}
          data={p.transform.statuses}
          pagination={false}
          sorting={false}
        />
      </div>
    </>
  );
};

const LogsTab = (p: { transform: TransformMetadata }) => {
  const topicName = '_redpanda.transform_logs';
  const topic = api.topics?.first((x) => x.topicName === topicName);

  const [logState, setLogState] = useState<{ messages: TopicMessage[]; isComplete: boolean }>({
    messages: [],
    isComplete: false,
  });
  const { messages, isComplete } = logState;
  const [logsQuickSearch, setLogsQuickSearch] = useState('');
  const searchRef = useRef<MessageSearch | null>(null);
  const [refreshCount, setRefreshCount] = useState(0);

  useEffect(() => {
    searchRef.current?.stopSearch();
    const search = createMessageSearch();
    searchRef.current = search;
    queueMicrotask(() => setLogState({ messages: [], isComplete: false }));
    executeMessageSearch(search, topicName, p.transform.name).finally(() => {
      setLogState({ messages: [...search.messages], isComplete: true });
    });
    return () => {
      search.stopSearch();
    };
  }, [refreshCount]);

  useEffect(() => {
    const interval = setInterval(() => {
      const search = searchRef.current;
      if (search) {
        setLogState((prev) => ({ ...prev, messages: [...search.messages] }));
      }
    }, 200);
    return () => clearInterval(interval);
  }, []);

  const loadLargeMessage = async (msgTopicName: string, partitionID: number, offset: number) => {
    const search = createMessageSearch();
    const searchReq: MessageSearchRequest = {
      filterInterpreterCode: '',
      maxResults: 1,
      partitionId: partitionID,
      startOffset: offset,
      startTimestamp: 0,
      topicName: msgTopicName,
      includeRawPayload: true,
      ignoreSizeLimit: true,
      keyDeserializer: PayloadEncoding.UNSPECIFIED,
      valueDeserializer: PayloadEncoding.UNSPECIFIED,
    };
    const loadedMessages = await search.startSearch(searchReq);

    if (loadedMessages && loadedMessages.length === 1) {
      setLogState((prev) => {
        const idx = prev.messages.findIndex((x) => x.partitionID === partitionID && x.offset === offset);
        if (idx === -1) return prev;
        const updated = [...prev.messages];
        updated[idx] = loadedMessages[0];
        return { ...prev, messages: updated };
      });
    } else {
      // biome-ignore lint/suspicious/noConsole: intentional console usage
      console.error('LoadLargeMessage: messages response is empty', { loadedMessages });
      throw new Error("LoadLargeMessage: Couldn't load the message content, the response was empty");
    }
  };

  const paginationParams = usePaginationParams(messages.length, 10);
  const logsTableOptions = useMemo(() => ({ initialState: { pagination: paginationParams } }), [paginationParams]);
  const messageTableColumns: DataTableColumnDef<TopicMessage>[] = useMemo(
    () => [
      // Chakra's DataTable injected this column whenever `subComponent` was set; the Registry one does not.
      // The Registry only sets aria-expanded on the row, and only for `expandRowByClick`, so it goes here.
      {
        id: 'expander',
        enableHiding: false,
        enableSorting: false,
        cell: ({ row }) =>
          row.getCanExpand() ? (
            <Button
              aria-expanded={row.getIsExpanded()}
              aria-label={row.getIsExpanded() ? 'Collapse row' : 'Expand row'}
              onClick={row.getToggleExpandedHandler()}
              size="icon-xs"
              variant="ghost"
            >
              {row.getIsExpanded() ? <ChevronDownIcon className="size-4" /> : <ChevronRightIcon className="size-4" />}
            </Button>
          ) : null,
      },
      {
        id: 'timestamp',
        enableHiding: false,
        header: ({ column }) => <DataTableColumnHeader column={column} title="Timestamp" />,
        accessorKey: 'timestamp',
        cell: ({
          row: {
            original: { timestamp },
          },
        }) => <TimestampDisplay format="default" unixEpochMillisecond={timestamp} />,
        size: 30,
      },
      {
        header: 'Value',
        // The cell renders a decoded preview; sorting the raw value was never meaningful.
        enableSorting: false,
        enableHiding: false,
        accessorKey: 'value',
        cell: ({ row: { original } }) => (
          <MessagePreview
            isCompactTopic={topic ? topic.cleanupPolicy.includes('compact') : false}
            msg={original}
            previewFields={() => []}
          />
        ),
        size: Number.MAX_SAFE_INTEGER,
      },
    ],
    [topic]
  );

  const filteredMessages = messages.filter((x) => {
    if (!logsQuickSearch) {
      return true;
    }
    return isFilterMatch(logsQuickSearch, x);
  });

  return (
    <>
      <div className="my-4">The logs below are for the last five hours.</div>

      <Section className="min-w-[800px]">
        <div className="mb-6 flex">
          <Input
            containerClassName="max-w-[230px]"
            onChange={(e) => setLogsQuickSearch(e.target.value)}
            placeholder="Search..."
            testId="search-field-input"
            value={logsQuickSearch}
          >
            <InputStart>
              <SearchIcon className="size-4 text-muted-foreground" data-testid="search-field-search-icon" />
            </InputStart>
            {/* Always mounted: InputEnd never resets the padding it measured, and unmounting the
                button under the click would drop focus to <body>. */}
            <InputEnd className="pointer-events-auto">
              <Button
                aria-label="Clear search"
                className={logsQuickSearch === '' ? 'invisible' : undefined}
                data-testid="search-field-reset-icon"
                disabled={logsQuickSearch === ''}
                onClick={() => setLogsQuickSearch('')}
                size="icon-xs"
                variant="ghost"
              >
                <CloseIcon />
              </Button>
            </InputEnd>
          </Input>
          <Button className="ml-auto" onClick={() => setRefreshCount((c) => c + 1)} variant="outline">
            Refresh logs
          </Button>
        </div>

        <DataTable<TopicMessage>
          columns={messageTableColumns}
          data={filteredMessages}
          emptyText="No messages"
          isLoading={!isComplete && messages.length === 0}
          sorting
          // todo: message rendering should be extracted from TopicMessagesTab into a standalone component, in its own folder,
          //       to make it clear that it does not depend on other functinoality from TopicMessagesTab
          subComponent={({ row: { original } }) => (
            <ExpandedMessage
              loadLargeMessage={() =>
                loadLargeMessage(
                  searchRef.current?.searchRequest?.topicName ?? '',
                  original.partitionID,
                  original.offset
                )
              }
              msg={original}
            />
          )}
          tableOptions={logsTableOptions}
        />
      </Section>
    </>
  );
};

function isFilterMatch(str: string, m: TopicMessage) {
  const lowerStr = str.toLowerCase();
  if (m.offset.toString().toLowerCase().includes(lowerStr)) {
    return true;
  }
  if (m.keyJson?.toLowerCase().includes(lowerStr)) {
    return true;
  }
  if (m.valueJson?.toLowerCase().includes(lowerStr)) {
    return true;
  }
  return false;
}

function executeMessageSearch(search: MessageSearch, topicName: string, transformName: string) {
  const filterCode: string = `return key == "${transformName}";`;

  const lastXHours = 5;
  const startTime = new Date();
  startTime.setHours(startTime.getHours() - lastXHours);

  const request = {
    topicName,
    partitionId: -1,

    startOffset: PartitionOffsetOrigin.Timestamp,
    startTimestamp: startTime.getTime(),
    maxResults: 1000,
    filterInterpreterCode: encodeBase64(sanitizeString(filterCode)),
    includeRawPayload: false,

    keyDeserializer: PayloadEncoding.UNSPECIFIED,
    valueDeserializer: PayloadEncoding.UNSPECIFIED,
  } as MessageSearchRequest;

  try {
    return search.startSearch(request).catch((err) => {
      const msg = (err as Error).message ?? String(err);
      // biome-ignore lint/suspicious/noConsole: intentional console usage
      console.error(`error in transformLogsMessageSearch: ${msg}`);
      return [];
    });
  } catch (error: unknown) {
    // biome-ignore lint/suspicious/noConsole: intentional console usage
    console.error(`error in transformLogsMessageSearch: ${(error as Error).message ?? String(error)}`);
    return Promise.resolve([]);
  }
}
