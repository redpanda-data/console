import { observable, autorun, makeObservable } from "mobx";
import { assignDeep, randomId } from "../utils/utils";
import { touch, clone } from "../utils/jsonUtils";
import { DEFAULT_TABLE_PAGE_SIZE } from "../components/misc/common";
import { TopicTabId } from "../components/pages/topics/Topic.Details";
import { AclRequest, AclRequestDefault } from "./restInterfaces";
import { TableSettings } from "../components/misc/KowlTable";
import { ConnectTabKeys } from "../components/pages/connect/Overview";

const settingsName = 'uiSettings-v3';

export type ValueDisplay = 'friendly' | 'both' | 'raw'

export interface PreviewTag {
    id: string;

    isActive: boolean;
    text: string;
    customName?: string;
}

export interface PreviewTagV2 {
    id: string;

    isActive: boolean;

    pattern: string; // pattern, upgrade from old "text" prop
    customName?: string;

    searchInMessageHeaders: boolean;
    searchInMessageKey: boolean;
    searchInMessageValue: boolean;
}

export interface ColumnList {
    title: string;
    dataIndex: string;
}

export type FilterType = 'simple' | 'code'
export const FilterOperators = [
    {
        name: '==',
    },
    {
        name: '!=',
    },
    {
        name: '<',
    },
    {
        name: '<=',
    },
] as const;
export type FilterOperator = (typeof FilterOperators[number])['name']

export class FilterEntry {
    constructor() {
        makeObservable(this);
    }

    id = randomId() + randomId(); // used as react key
    @observable filterType: FilterType = 'code';

    @observable isActive = true;

    // Simple
    @observable property: string = ''; // ex: 'battle.type'
    @observable operator: FilterOperator = '==';
    @observable value: string = ''; // any js expression: string, number, or array

    // Code
    @observable name: string = ''; // name of the filter, shown instead of the code when set
    @observable code: string = 'return true\n//allow all messages'; // js code the user entered
}


export type TimestampDisplayFormat = 'default' | 'unixTimestamp' | 'onlyDate' | 'onlyTime' | 'unixSeconds' | 'relative';
export function IsLocalTimestampFormat(timestampType: TimestampDisplayFormat) {
    switch (timestampType) {
        case 'default': return true; // 'localDateTime'
        case 'onlyDate': return true;
        case 'onlyTime': return true;
        case 'relative': return true;
    }
    return false;
}

export enum TopicOffsetOrigin { EndMinusResults = -1, Start = -2, End = -3, Timestamp = -4, Custom = 0 }
export type TopicMessageSearchSettings = TopicDetailsSettings['searchParams']
// Settings for an individual topic
export class TopicDetailsSettings {
    constructor() {
        makeObservable(this);
    }

    topicName: string;

    @observable searchParams = {
        offsetOrigin: -1 as TopicOffsetOrigin, // start, end, custom
        startOffset: -1, // used when offsetOrigin is custom
        startTimestamp: -1, // used when offsetOrigin is timestamp
        startTimestampWasSetByUser: false, // only used in frontend, to track whether we should update the timestamp to 'now' when the page loads
        partitionID: -1,
        maxResults: 50,

        filtersEnabled: false,
        filters: [] as FilterEntry[],
    };

    @observable messagesPageSize = 20;
    @observable favConfigEntries: string[] = ['cleanup.policy', 'segment.bytes', 'segment.ms'];

    @observable previewTags = [] as PreviewTagV2[];
    @observable previewTagsCaseSensitive = false;

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


    @observable quickSearch = '';

}

const uiSettings = observable({
    sideBarOpen: true,
    selectedClusterIndex: 0,
    perTopicSettings: [] as TopicDetailsSettings[], // don't use directly, instead use uiState.topicDetails
    topicDetailsActiveTabKey: undefined as TopicTabId | undefined,

    topicDetailsShowStatisticsBar: true, // for now: global for all topic details
    jsonViewer: {
        fontSize: '12px',
        lineHeight: '1em',
        maxStringLength: 200,
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
        }
    },

    reassignment: { // partition reassignment
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
    },

    consumerGroupList: {
        pageSize: DEFAULT_TABLE_PAGE_SIZE,
        quickSearch: '',
    },

    consumerGroupDetails: {
        pageSize: DEFAULT_TABLE_PAGE_SIZE,
        showStatisticsBar: true,
    },

    aclSearchParams: clone(AclRequestDefault) as AclRequest,

    quotasList: {
        pageSize: DEFAULT_TABLE_PAGE_SIZE,
        quickSearch: '',
    },

    schemaList: {
        pageSize: DEFAULT_TABLE_PAGE_SIZE,
        quickSearch: ''
    },

    schemaDetails: {
        viewMode: 'fields' as 'json' | 'fields',
    },

    kafkaConnect: {
        selectedTab: 'clusters' as ConnectTabKeys,

        clusters: {
            pageSize: undefined as any as number,
            quickSearch: ''
        },
        connectors: {
            pageSize: undefined as any as number,
            quickSearch: ''
        },
        tasks: {
            pageSize: undefined as any as number,
            quickSearch: ''
        },

        clusterDetails: {
            pageSize: undefined as any as number,
            quickSearch: ''
        },
        clusterDetailsPlugins: {
            pageSize: undefined as any as number,
            quickSearch: ''
        },

        connectorDetails: {
            pageSize: undefined as any as number,
            quickSearch: ''
        }
    },

    userDefaults: {
        paginationPosition: 'bottomRight' as ('bottomRight' | 'topRight'),
    }
});
export { uiSettings };



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
                    pattern: '**.' + tag.text,
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
autorun(() => {
    touch(uiSettings);
    const json = JSON.stringify(uiSettings);
    localStorage.setItem(settingsName, json);
    //console.log('settings: ' + json);
}, { delay: 1000 });

// Auto save (on exit)
window.addEventListener('beforeunload', () => {
    const json = JSON.stringify(uiSettings);
    localStorage.setItem(settingsName, json);
    //console.log('settings (unload): ' + json);
});

