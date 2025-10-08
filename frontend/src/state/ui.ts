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

import type { SortingState } from '@redpanda-data/ui';
import { autorun, makeObservable, observable, transaction } from 'mobx';

import { AclRequestDefault, type GetAclsRequest } from './rest-interfaces';
import { DEFAULT_TABLE_PAGE_SIZE } from '../components/constants';
import type { ConnectTabKeys } from '../components/pages/connect/overview';
import type { TopicTabId } from '../components/pages/topics/topic-details';
import { CompressionType, PayloadEncoding } from '../protogen/redpanda/api/console/v1alpha1/common_pb';
import { clone } from '../utils/json-utils';
import { assignDeep, randomId } from '../utils/utils';

const settingsName = 'uiSettings-v3';

export type ValueDisplay = 'friendly' | 'both' | 'raw';

export type PreviewTag = {
  id: string;

  isActive: boolean;
  text: string;
  customName?: string;
};

export type PreviewTagV2 = {
  id: string;

  isActive: boolean;

  pattern: string; // pattern, upgrade from old "text" prop
  customName?: string;

  searchInMessageHeaders: boolean;
  searchInMessageKey: boolean;
  searchInMessageValue: boolean;
};

export type DataColumnKey = 'offset' | 'partitionID' | 'timestamp' | 'key' | 'value' | 'keySize' | 'valueSize';

export type ColumnList = {
  title: string;
  dataIndex: DataColumnKey;
};

export type FilterType = 'code';
export class FilterEntry {
  constructor() {
    makeObservable(this);
  }

  @observable isNew = false;
  id = randomId() + randomId(); // used as react key
  @observable filterType: FilterType = 'code';

  @observable isActive = true;

  // Code
  @observable name = ''; // name of the filter, shown instead of the code when set
  @observable transpiledCode = 'return true;\n';
  @observable code = 'return true\n//allow all messages'; // js code the user entered
}

export type TimestampDisplayFormat = 'default' | 'unixTimestamp' | 'onlyDate' | 'onlyTime' | 'unixMillis' | 'relative';
export function IsLocalTimestampFormat(timestampType: TimestampDisplayFormat) {
  switch (timestampType) {
    case 'default':
      return true; // 'localDateTime'
    case 'onlyDate':
      return true;
    case 'onlyTime':
      return true;
    case 'relative':
      return true;
    case 'unixTimestamp':
      return false;
    case 'unixMillis':
      return false;
    default:
      return true;
  }
}

export const PartitionOffsetOrigin = {
  EndMinusResults: -1,
  Start: -2,
  End: -3,
  Timestamp: -4,
  Custom: 0,
} as const;

export type PartitionOffsetOriginType = (typeof PartitionOffsetOrigin)[keyof typeof PartitionOffsetOrigin];

export const DEFAULT_SEARCH_PARAMS = {
  offsetOrigin: -1 as PartitionOffsetOriginType, // start, end, custom
  startOffset: -1, // used when offsetOrigin is custom
  startTimestamp: -1, // used when offsetOrigin is timestamp
  startTimestampWasSetByUser: false, // only used in frontend, to track whether we should update the timestamp to 'now' when the page loads
  partitionID: -1,
  maxResults: 50,
  page: 0,
  pageSize: 10,
  sorting: [] as SortingState,
  quickSearch: '',

  filtersEnabled: false,
  filters: [] as FilterEntry[],

  keyDeserializer: PayloadEncoding.UNSPECIFIED as PayloadEncoding,
  valueDeserializer: PayloadEncoding.UNSPECIFIED as PayloadEncoding,
};

export type TopicMessageSearchSettings = TopicDetailsSettings['searchParams'];

// Settings for an individual topic
export class TopicDetailsSettings {
  constructor() {
    makeObservable(this);
  }

  topicName: string;

  @observable searchParams = { ...DEFAULT_SEARCH_PARAMS };

  @observable dynamicFilters: 'partition'[] = [];

  @observable messagesPageSize = 20;
  @observable favConfigEntries: string[] = ['cleanup.policy', 'segment.bytes', 'segment.ms'];

  @observable previewTags = [] as PreviewTagV2[];
  @observable previewTagsCaseSensitive: 'caseSensitive' | 'ignoreCase' = 'ignoreCase';

  @observable previewMultiResultMode = 'showAll' as 'showOnlyFirst' | 'showAll'; // maybe todo: 'limitTo'|'onlyCount' ?
  @observable previewDisplayMode = 'wrap' as 'single' | 'wrap' | 'rows'; // only one line / wrap / seperate line for each result

  // @observable previewResultLimit: 3; // todo
  @observable previewShowEmptyMessages = true; // todo: filter out messages that don't match
  @observable showMessageMetadata = true;
  @observable showMessageHeaders = false;

  @observable searchParametersLocalTimeMode = true;
  @observable previewTimestamps = 'default' as TimestampDisplayFormat;
  @observable previewColumnFields = [] as ColumnList[];

  @observable consumerPageSize = 20;
  @observable partitionPageSize = 20;
  @observable aclPageSize = 20;

  @observable produceRecordEncoding = PayloadEncoding.TEXT as PayloadEncoding | 'base64';
  @observable produceRecordCompression = CompressionType.SNAPPY;

  @observable quickSearch = '';
}

const defaultUiSettings = {
  sideBarOpen: true,
  selectedClusterIndex: 0,
  perTopicSettings: [] as TopicDetailsSettings[], // don't use directly, instead use uiState.topicDetails
  topicDetailsActiveTabKey: undefined as TopicTabId | undefined,

  topicDetailsShowStatisticsBar: true, // for now: global for all topic details
  autoRefreshIntervalSecs: 10,
  jsonViewer: {
    fontSize: '12px',
    lineHeight: '1em',
    maxStringLength: 200,
    collapsed: 2,
  },

  // todo: refactor into: brokers.list, brokers.detail, topics.messages, topics.config, ...
  brokerList: {
    hideEmptyColumns: false,
    pageSize: DEFAULT_TABLE_PAGE_SIZE,
    quickSearch: '',

    valueDisplay: 'friendly' as 'friendly' | 'raw',
    propsFilter: 'onlyChanged' as 'all' | 'onlyChanged',
    propsOrder: 'alphabetical' as 'changedFirst' | 'default' | 'alphabetical',

    configTable: {
      pageSize: 100,
      quickSearch: '',
    },
  },

  reassignment: {
    // partition reassignment
    // Active
    activeReassignments: {
      quickSearch: '',
      pageSize: 5,
    },

    // Select
    quickSearch: '',
    pageSizeSelect: 10,

    // Brokers
    pageSizeBrokers: 10,

    // Review
    pageSizeReview: 20,
    maxReplicationTraffic: 0 as number | null, // bytes per second, or "no change"
  },

  topicList: {
    hideInternalTopics: true,
    quickSearch: '',
    pageSize: DEFAULT_TABLE_PAGE_SIZE, // number of topics to show

    // Topic Configuration
    valueDisplay: 'friendly' as ValueDisplay,
    propsOrder: 'changedFirst' as 'changedFirst' | 'default' | 'alphabetical',

    configViewType: 'structured' as 'structured' | 'table',
  },

  clusterOverview: {
    connectorsList: {
      quickSearch: '',
    },
  },

  connectorsList: {
    quickSearch: '',
  },

  connectorsDetails: {
    logsQuickSearch: '',
    sorting: [] as SortingState,
  },

  pipelinesList: {
    quickSearch: '',
  },

  knowledgeBaseList: {
    quickSearch: '',
  },

  rpcnSecretList: {
    quickSearch: '',
  },

  pipelinesDetails: {
    logsQuickSearch: '',
    sorting: [] as SortingState,
  },

  consumerGroupList: {
    pageSize: DEFAULT_TABLE_PAGE_SIZE,
    quickSearch: '',
  },

  consumerGroupDetails: {
    pageSize: DEFAULT_TABLE_PAGE_SIZE,
    showStatisticsBar: true,
  },

  aclList: {
    usersTab: {
      quickSearch: '',
      pageSize: 20,
    },
    rolesTab: {
      quickSearch: '',
      pageSize: 20,
    },
    permissionsTab: {
      quickSearch: '',
      pageSize: 20,
    },

    configTable: {
      quickSearch: '',
      pageSize: 20,
    },
  },

  aclSearchParams: clone(AclRequestDefault) as GetAclsRequest,

  quotasList: {
    pageSize: DEFAULT_TABLE_PAGE_SIZE,
    quickSearch: '',
  },

  schemaList: {
    pageSize: DEFAULT_TABLE_PAGE_SIZE,
    quickSearch: '',
    showSoftDeleted: false,
  },

  schemaDetails: {
    viewMode: 'fields' as 'json' | 'fields',
  },

  kafkaConnect: {
    selectedTab: 'clusters' as ConnectTabKeys,

    clusters: {
      pageSize: undefined as unknown as number,
      quickSearch: '',
    },
    connectors: {
      pageSize: undefined as unknown as number,
      quickSearch: '',
    },
    tasks: {
      pageSize: undefined as unknown as number,
      quickSearch: '',
    },

    clusterDetails: {
      pageSize: undefined as unknown as number,
      quickSearch: '',
    },
    clusterDetailsPlugins: {
      pageSize: undefined as unknown as number,
      quickSearch: '',
    },

    connectorDetails: {
      pageSize: undefined as unknown as number,
      quickSearch: '',
    },
  },

  transformsList: {
    quickSearch: '',
  },

  userDefaults: {
    paginationPosition: 'bottomRight' as 'bottomRight' | 'topRight',
  },
};
Object.freeze(defaultUiSettings);

const uiSettings = observable(clone(defaultUiSettings));
export { uiSettings };

export function clearSettings() {
  transaction(() => {
    for (const k in uiSettings) {
      if (Object.hasOwn(uiSettings, k)) {
        delete (uiSettings as Record<string, unknown>)[k];
      }
    }
    assignDeep(uiSettings, clone(defaultUiSettings));
  });
}

//
// Settings save/load

// Load settings
const storedSettingsJson = localStorage.getItem(settingsName);
if (storedSettingsJson) {
  const loadedSettings = JSON.parse(storedSettingsJson);
  assignDeep(uiSettings, loadedSettings); // overwrite defaults with loaded values

  // Upgrade: new props in 'TopicDetailsSettings'
  for (const ts of uiSettings.perTopicSettings) {
    // when loading a previous version, we'll have "undefined" for all the new properties,
    // which is ok for 'number', but not for any other type.
    ts.previewColumnFields = ts.previewColumnFields ?? [];
    ts.previewTimestamps = ts.previewTimestamps ?? 'default';

    if (!ts.dynamicFilters) {
      ts.dynamicFilters = [];
    }
  }

  // Upgrade: PreviewTag to PreviewTagV2
  for (const ts of uiSettings.perTopicSettings) {
    for (let i = 0; i < ts.previewTags.length; i++) {
      const tag = ts.previewTags[i];
      if (isPreviewTagV1(tag)) {
        // upgrade by constructing a new tag from the old data
        const newTag: PreviewTagV2 = {
          id: tag.id,
          isActive: tag.isActive,
          pattern: `**.${tag.text}`,
          customName: tag.customName,
          searchInMessageHeaders: false,
          searchInMessageKey: false,
          searchInMessageValue: true,
        };

        // replace old tag
        ts.previewTags[i] = newTag;
      }
    }
  }
}

function isPreviewTagV1(tag: PreviewTag | PreviewTagV2): tag is PreviewTag {
  return (tag as PreviewTag).text !== undefined;
}

// Auto save (timed)
autorun(
  () => {
    const json = JSON.stringify(uiSettings);
    localStorage.setItem(settingsName, json);
  },
  { delay: 2000 }
);

// Auto save (on exit)
window.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    return; // only save on close, minimize, tab-switch
  }

  const json = JSON.stringify(uiSettings);
  localStorage.setItem(settingsName, json);
});

// When there are multiple tabs open, they are unaware of each other and overwriting each others changes.
// So we must listen to changes made by other tabs, and when a change is saved we load the updated settings.
window.addEventListener('storage', (e) => {
  if (e.newValue == null) {
    return;
  }
  try {
    const newSettings = JSON.parse(e.newValue);
    if (!newSettings) {
      return;
    }
    transaction(() => {
      // Applying changes here will of course trigger the auto-save, but that's fine.
      // The settings will be serialized to the exact same json again, so no storage events will be triggered by `.setItem()`
      assignDeep(uiSettings, newSettings);
    });
  } catch (err) {
    // biome-ignore lint/suspicious/noConsole: intentional console usage
    console.error('error applying settings update from another tab', { storageEvent: e, error: err });
  }
});
