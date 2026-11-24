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

import { ChevronDownIcon, ChevronRightIcon } from 'components/icons';
import { Button } from 'components/redpanda-ui/components/button';
import {
  DataTable,
  type DataTableColumnDef,
  DataTableColumnHeader,
} from 'components/redpanda-ui/components/data-table';
import {
  type Dispatch,
  Fragment,
  type RefObject,
  type SetStateAction,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { showToast } from 'utils/toast.utils';

import { openDeleteModal } from './modals';
import { PartitionStatus } from './transforms-list';
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
import { DefaultSkeleton, quickTable, TimestampDisplay } from '../../../utils/tsx-utils';
import { decodeURIComponentPercents, encodeBase64 } from '../../../utils/utils';
import { DEFAULT_TABLE_PAGE_SIZE } from '../../constants';
import PageContent from '../../misc/page-content';
import { SearchInput } from '../../misc/search-input';
import Section from '../../misc/section';
import Tabs from '../../misc/tabs/tabs';
import { PageComponent, type PageInitHelper } from '../page';
import { ExpandedMessage } from '../topics/Tab.Messages/message-display/expanded-message';
import { MessagePreview } from '../topics/Tab.Messages/message-display/message-preview';

class TransformDetails extends PageComponent<{ transformName: string }> {
  initPage(p: PageInitHelper) {
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
    this.transformsApi.refreshTransforms(force);
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
/**
 * Expanded log rows retain message identity across refreshes. A manual refresh starts a new search, and unmount cancels the active search.
 */
export default TransformDetails;

const TABLE_OPTIONS = {
  enableHiding: false,
  initialState: { pagination: { pageIndex: 0, pageSize: DEFAULT_TABLE_PAGE_SIZE } },
};
const LOGS_TABLE_OPTIONS = {
  enableHiding: false,
  initialState: { pagination: { pageIndex: 0, pageSize: 10 } },
  getRowId: (message: TopicMessage) => `${message.partitionID}-${message.offset}`,
};

const partitionStatusColumns: DataTableColumnDef<PartitionTransformStatus>[] = [
  {
    header: ({ column }) => <DataTableColumnHeader column={column} title="Partition" />,
    accessorKey: 'partitionId',
  },
  {
    header: ({ column }) => <DataTableColumnHeader column={column} title="Node" />,
    accessorKey: 'brokerId',
  },
  {
    id: 'status',
    header: 'Status',
    cell: ({ row: { original: r } }) => <PartitionStatus status={r.status} />,
  },
  {
    header: ({ column }) => <DataTableColumnHeader column={column} title="Lag" />,
    accessorKey: 'lag',
  },
];

const OverviewTab = (p: { transform: TransformMetadata }) => {
  let overallStatus: React.ReactNode;
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
        {quickTable(
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
          pagination={p.transform.statuses.length > DEFAULT_TABLE_PAGE_SIZE}
          sorting
          tableOptions={TABLE_OPTIONS}
        />
      </div>
    </>
  );
};

const TRANSFORM_LOGS_TOPIC = '_redpanda.transform_logs';

type TransformLogState = { messages: TopicMessage[]; isComplete: boolean };

const EMPTY_TRANSFORM_LOGS: TransformLogState = { messages: [], isComplete: false };

function restartTransformLogSearch(
  searchRef: RefObject<MessageSearch | null>,
  transformName: string,
  setLogState: Dispatch<SetStateAction<TransformLogState>>
) {
  searchRef.current?.stopSearch();
  const search = createMessageSearch();
  searchRef.current = search;
  executeMessageSearch(search, TRANSFORM_LOGS_TOPIC, transformName).finally(() => {
    setLogState({ messages: [...search.messages], isComplete: true });
  });
}

const useTransformLogs = (transformName: string) => {
  const [logState, setLogState] = useState<TransformLogState>(EMPTY_TRANSFORM_LOGS);
  const searchRef = useRef<MessageSearch | null>(null);

  useEffect(() => {
    queueMicrotask(() => setLogState(EMPTY_TRANSFORM_LOGS));
    restartTransformLogSearch(searchRef, transformName, setLogState);
    return () => {
      // WARNING: Stop whichever search is current; a manual refresh may have replaced the search started by this effect.
      searchRef.current?.stopSearch();
    };
  }, [transformName]);

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
        if (idx === -1) {
          return prev;
        }
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

  const refresh = () => {
    setLogState(EMPTY_TRANSFORM_LOGS);
    restartTransformLogSearch(searchRef, transformName, setLogState);
  };
  const loadLargeMessageOf = (msg: TopicMessage) =>
    loadLargeMessage(searchRef.current?.searchRequest?.topicName ?? '', msg.partitionID, msg.offset);

  return { ...logState, refresh, loadLargeMessageOf };
};

const LogsTab = (p: { transform: TransformMetadata }) => {
  const topic = api.topics?.first((x) => x.topicName === TRANSFORM_LOGS_TOPIC);
  const { messages, isComplete, refresh, loadLargeMessageOf } = useTransformLogs(p.transform.name);
  const [logsQuickSearch, setLogsQuickSearch] = useState('');

  const messageTableColumns: DataTableColumnDef<TopicMessage>[] = useMemo(
    () => [
      // WARNING: Keep aria-expanded on the expander; the table sets it on the row only in click-to-expand mode.
      {
        id: 'expander',
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
        header: ({ column }) => <DataTableColumnHeader column={column} title="Timestamp" />,
        accessorKey: 'timestamp',
        cell: ({
          row: {
            original: { timestamp },
          },
        }) => (
          <span className="whitespace-nowrap">
            <TimestampDisplay format="default" unixEpochMillisecond={timestamp} />
          </span>
        ),
      },
      {
        header: 'Value',
        enableSorting: false,
        accessorKey: 'value',
        cell: ({ row: { original } }) => (
          <div className="w-screen max-w-full">
            <MessagePreview
              isCompactTopic={topic ? topic.cleanupPolicy.includes('compact') : false}
              msg={original}
              previewFields={() => []}
            />
          </div>
        ),
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
          <SearchInput
            containerClassName="w-[230px]"
            onChange={setLogsQuickSearch}
            placeholder="Search..."
            value={logsQuickSearch}
          />
          <Button className="ml-auto" onClick={refresh} variant="outline">
            Refresh logs
          </Button>
        </div>

        <DataTable<TopicMessage>
          columns={messageTableColumns}
          data={filteredMessages}
          emptyText="No messages"
          isLoading={!isComplete && messages.length === 0}
          pagination={filteredMessages.length > 0}
          sorting
          subComponent={({ row: { original } }) => (
            <ExpandedMessage loadLargeMessage={() => loadLargeMessageOf(original)} msg={original} />
          )}
          tableOptions={LOGS_TABLE_OPTIONS}
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
