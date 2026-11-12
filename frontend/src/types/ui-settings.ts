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

import type { SortingState } from '@tanstack/react-table';
import { z } from 'zod';

import type { TopicDetailsSettings } from './topic-settings';
import {
  decodeTopicSettingsList,
  mergePersistedSettings,
  optionalPersistedSetting,
  persistedSorting,
} from './topic-settings';
import { DEFAULT_TABLE_PAGE_SIZE } from '../components/constants';
import type { TopicTabId } from '../components/pages/topics/topic-details';
import { AclRequestDefault, type GetAclsRequest } from '../state/rest-interfaces';
import { isObject, isUnknownArray } from '../utils/type-guards';

export type ValueDisplay = 'friendly' | 'both' | 'raw';
export type ConnectTabKeys = 'clusters' | 'connectors' | 'tasks';

export type UISettings = {
  sideBarOpen: boolean;
  selectedClusterIndex: number;
  perTopicSettings: TopicDetailsSettings[]; // don't use directly, instead use uiState.topicDetails
  topicDetailsActiveTabKey: TopicTabId | undefined;

  // todo: refactor into: brokers.list, brokers.detail, topics.messages, topics.config, ...
  brokerList: {
    hideEmptyColumns: boolean;
    pageSize: number;
    quickSearch: string;

    valueDisplay: 'friendly' | 'raw';
    propsFilter: 'all' | 'onlyChanged';
    propsOrder: 'changedFirst' | 'default' | 'alphabetical';

    configTable: {
      pageSize: number;
      quickSearch: string;
    };
  };

  reassignment: {
    // partition reassignment
    // Active
    activeReassignments: {
      quickSearch: string;
      pageSize: number;
    };

    // Brokers
    pageSizeBrokers: number;

    // Review
    pageSizeReview: number;
    maxReplicationTraffic: number | null; // bytes per second, or "no change"
  };

  topicList: {
    hideInternalTopics: boolean;
    quickSearch: string;
    pageSize: number;
    sortId: string;
    sortDesc: boolean;

    // Topic Configuration
    valueDisplay: ValueDisplay;
    propsOrder: 'changedFirst' | 'default' | 'alphabetical';

    configViewType: 'structured' | 'table';
  };

  topicConsumersList: {
    pageSize: number;
    sortId: string;
    sortDesc: boolean;
  };

  topicPartitionsList: {
    pageSize: number;
    sortId: string;
    sortDesc: boolean;
  };

  topicAclList: {
    pageSize: number;
    sortId: string;
    sortDesc: boolean;
  };

  clusterOverview: {
    connectorsList: {
      quickSearch: string;
    };
  };

  connectorsList: {
    quickSearch: string;
  };

  connectorsDetails: {
    logsQuickSearch: string;
    sorting: SortingState;
  };

  pipelinesList: {
    quickSearch: string;
  };

  pipelinesDetails: {
    logsQuickSearch: string;
    sorting: SortingState;
  };

  consumerGroupDetails: {
    pageSize: number;
  };

  aclList: {
    usersTab: {
      quickSearch: string;
      pageSize: number;
    };
    rolesTab: {
      quickSearch: string;
      pageSize: number;
    };
    permissionsTab: {
      quickSearch: string;
      pageSize: number;
    };

    configTable: {
      quickSearch: string;
      pageSize: number;
    };
  };

  aclSearchParams: GetAclsRequest;

  quotasList: {
    pageSize: number;
    quickSearch: string;
  };

  schemaList: {
    pageSize: number;
    quickSearch: string;
    showSoftDeleted: boolean;
  };

  schemaDetails: {
    viewMode: 'json' | 'fields';
  };

  kafkaConnect: {
    selectedTab: ConnectTabKeys;

    clusters: {
      pageSize: number | undefined;
      quickSearch: string;
    };
    connectors: {
      pageSize: number | undefined;
      quickSearch: string;
    };
    tasks: {
      pageSize: number | undefined;
      quickSearch: string;
    };

    clusterDetails: {
      pageSize: number | undefined;
      quickSearch: string;
    };
    clusterDetailsPlugins: {
      pageSize: number | undefined;
      quickSearch: string;
    };

    connectorDetails: {
      pageSize: number | undefined;
      quickSearch: string;
    };
  };

  transformsList: {
    quickSearch: string;
  };

  userDefaults: {
    paginationPosition: 'bottomRight' | 'topRight';
  };
};

export const defaultUiSettings: UISettings = {
  sideBarOpen: true,
  selectedClusterIndex: 0,
  perTopicSettings: [], // don't use directly, instead use uiState.topicDetails
  topicDetailsActiveTabKey: undefined,

  // todo: refactor into: brokers.list, brokers.detail, topics.messages, topics.config, ...
  brokerList: {
    hideEmptyColumns: false,
    pageSize: DEFAULT_TABLE_PAGE_SIZE,
    quickSearch: '',

    valueDisplay: 'friendly',
    propsFilter: 'onlyChanged',
    propsOrder: 'alphabetical',

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

    // Brokers
    pageSizeBrokers: 10,

    // Review
    pageSizeReview: 20,
    maxReplicationTraffic: 0, // bytes per second, or "no change"
  },

  topicList: {
    hideInternalTopics: true,
    quickSearch: '',
    pageSize: DEFAULT_TABLE_PAGE_SIZE,
    sortId: '',
    sortDesc: false,

    // Topic Configuration
    valueDisplay: 'friendly',
    propsOrder: 'changedFirst',

    configViewType: 'structured',
  },

  topicConsumersList: {
    pageSize: 20,
    sortId: '',
    sortDesc: false,
  },

  topicPartitionsList: {
    pageSize: 20,
    sortId: '',
    sortDesc: false,
  },

  topicAclList: {
    pageSize: 20,
    sortId: '',
    sortDesc: false,
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
    sorting: [],
  },

  pipelinesList: {
    quickSearch: '',
  },

  pipelinesDetails: {
    logsQuickSearch: '',
    sorting: [],
  },

  consumerGroupDetails: {
    pageSize: DEFAULT_TABLE_PAGE_SIZE,
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

  aclSearchParams: { ...AclRequestDefault },

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
    viewMode: 'fields',
  },

  kafkaConnect: {
    selectedTab: 'clusters',

    clusters: {
      pageSize: undefined,
      quickSearch: '',
    },
    connectors: {
      pageSize: undefined,
      quickSearch: '',
    },
    tasks: {
      pageSize: undefined,
      quickSearch: '',
    },

    clusterDetails: {
      pageSize: undefined,
      quickSearch: '',
    },
    clusterDetailsPlugins: {
      pageSize: undefined,
      quickSearch: '',
    },

    connectorDetails: {
      pageSize: undefined,
      quickSearch: '',
    },
  },

  transformsList: {
    quickSearch: '',
  },

  userDefaults: {
    paginationPosition: 'bottomRight',
  },
};

const stringSetting = optionalPersistedSetting(z.string());
const numberSetting = optionalPersistedSetting(z.number());
const booleanSetting = optionalPersistedSetting(z.boolean());
const propsOrder = optionalPersistedSetting(z.enum(['changedFirst', 'default', 'alphabetical']));
const tableSettings = z.looseObject({ pageSize: numberSetting, quickSearch: stringSetting });
const sortTableSettings = z.looseObject({ pageSize: numberSetting, sortId: stringSetting, sortDesc: booleanSetting });
const logSettings = z.looseObject({
  logsQuickSearch: stringSetting,
  sorting: optionalPersistedSetting(persistedSorting),
});
const uiSettingsPatch = z.looseObject({
  sideBarOpen: booleanSetting,
  selectedClusterIndex: numberSetting,
  perTopicSettings: optionalPersistedSetting(z.array(z.unknown()).transform(decodeTopicSettingsList)),
  topicDetailsActiveTabKey: optionalPersistedSetting(
    z.enum(['messages', 'consumers', 'partitions', 'configuration', 'documentation', 'topicacl'])
  ),
  brokerList: optionalPersistedSetting(
    tableSettings.extend({
      hideEmptyColumns: booleanSetting,
      valueDisplay: optionalPersistedSetting(z.enum(['friendly', 'raw'])),
      propsFilter: optionalPersistedSetting(z.enum(['all', 'onlyChanged'])),
      propsOrder,
      configTable: optionalPersistedSetting(tableSettings),
    })
  ),
  reassignment: optionalPersistedSetting(
    z.looseObject({
      activeReassignments: optionalPersistedSetting(tableSettings),
      pageSizeBrokers: numberSetting,
      pageSizeReview: numberSetting,
      maxReplicationTraffic: optionalPersistedSetting(z.number().nullable()),
    })
  ),
  topicList: optionalPersistedSetting(
    sortTableSettings.extend({
      hideInternalTopics: booleanSetting,
      quickSearch: stringSetting,
      valueDisplay: optionalPersistedSetting(z.enum(['friendly', 'both', 'raw'])),
      propsOrder,
      configViewType: optionalPersistedSetting(z.enum(['structured', 'table'])),
    })
  ),
  topicConsumersList: optionalPersistedSetting(sortTableSettings),
  topicPartitionsList: optionalPersistedSetting(sortTableSettings),
  topicAclList: optionalPersistedSetting(sortTableSettings),
  clusterOverview: optionalPersistedSetting(
    z.looseObject({ connectorsList: optionalPersistedSetting(z.looseObject({ quickSearch: stringSetting })) })
  ),
  connectorsList: optionalPersistedSetting(z.looseObject({ quickSearch: stringSetting })),
  connectorsDetails: optionalPersistedSetting(logSettings),
  pipelinesList: optionalPersistedSetting(z.looseObject({ quickSearch: stringSetting })),
  pipelinesDetails: optionalPersistedSetting(logSettings),
  consumerGroupDetails: optionalPersistedSetting(z.looseObject({ pageSize: numberSetting })),
  aclList: optionalPersistedSetting(
    z.looseObject({
      usersTab: optionalPersistedSetting(tableSettings),
      rolesTab: optionalPersistedSetting(tableSettings),
      permissionsTab: optionalPersistedSetting(tableSettings),
      configTable: optionalPersistedSetting(tableSettings),
    })
  ),
  // These REST enum strings are forward-compatible wire values, not a closed UI picker.
  aclSearchParams: optionalPersistedSetting(
    z.looseObject({
      resourceType: stringSetting,
      resourceName: stringSetting,
      resourcePatternTypeFilter: stringSetting,
      principal: stringSetting,
      host: stringSetting,
      operation: stringSetting,
      permissionType: stringSetting,
    })
  ),
  quotasList: optionalPersistedSetting(tableSettings),
  schemaList: optionalPersistedSetting(tableSettings.extend({ showSoftDeleted: booleanSetting })),
  schemaDetails: optionalPersistedSetting(
    z.looseObject({ viewMode: optionalPersistedSetting(z.enum(['json', 'fields'])) })
  ),
  kafkaConnect: optionalPersistedSetting(
    z.looseObject({
      selectedTab: optionalPersistedSetting(z.enum(['clusters', 'connectors', 'tasks'])),
      clusters: optionalPersistedSetting(tableSettings),
      connectors: optionalPersistedSetting(tableSettings),
      tasks: optionalPersistedSetting(tableSettings),
      clusterDetails: optionalPersistedSetting(tableSettings),
      clusterDetailsPlugins: optionalPersistedSetting(tableSettings),
      connectorDetails: optionalPersistedSetting(tableSettings),
    })
  ),
  transformsList: optionalPersistedSetting(z.looseObject({ quickSearch: stringSetting })),
  userDefaults: optionalPersistedSetting(
    z.looseObject({ paginationPosition: optionalPersistedSetting(z.enum(['bottomRight', 'topRight'])) })
  ),
});

/** Decode partial old settings over a cloned current/default snapshot; invalid leaves never reset valid siblings. */
export function decodeUiSettings(value: unknown, base: UISettings = defaultUiSettings): UISettings | undefined {
  if (!isObject(value) || isUnknownArray(value)) {
    return undefined;
  }
  const parsed = uiSettingsPatch.safeParse(value);
  if (!parsed.success) {
    return undefined;
  }
  const settings = structuredClone(base);
  mergePersistedSettings(settings, parsed.data);
  return settings;
}
