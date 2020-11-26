import { observable, autorun } from "mobx";
import { touch, assignDeep, randomId, simpleUniqueId, uniqueId4, clone } from "../utils/utils";
import { DEFAULT_TABLE_PAGE_SIZE } from "../components/misc/common";
import { TopicTabId } from "../components/pages/topics/Topic.Details";
import { AclRequest, AclRequestDefault } from "./restInterfaces";

const settingsName = 'uiSettings-v3';


export interface PreviewTag {
    value: string;
    active: boolean;
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


export type TimestampDisplayFormat = 'default' | 'onlyDate' | 'onlyTime' | 'unixSeconds' | 'relative';
export enum TopicOffsetOrigin { EndMinusResults = -1, Start = -2, End = -3, Custom = 0 }
export type TopicMessageSearchSettings = TopicDetailsSettings['searchParams']
// Settings for an individual topic
export class TopicDetailsSettings {
    topicName: string;

    @observable searchParams = {
        offsetOrigin: -1 as TopicOffsetOrigin, // start, end, custom
        startOffset: -1, // used when offsetOrigin is custom
        partitionID: -1,
        maxResults: 50,

        filtersEnabled: false,
        filters: [] as FilterEntry[],
    };

    @observable messagesPageSize = 20;
    @observable favConfigEntries: string[] = ['cleanup.policy', 'segment.bytes', 'segment.ms'];

    @observable previewTags = [] as PreviewTag[];
    @observable previewTagsCaseSensitive = false;

    @observable previewMultiResultMode = 'showAll' as 'showOnlyFirst' | 'showAll'; // maybe todo: 'limitTo'|'onlyCount' ?
    @observable previewShowResultCount = false;
    // @observable previewResultLimit: 3; // todo
    @observable previewShowEmptyMessages = true; // todo: filter out messages that don't match
    @observable showMessageHeaders = false;

    @observable previewTimestamps = 'default' as TimestampDisplayFormat;
    @observable previewColumnFields = [] as ColumnList[];

    @observable consumerPageSize = 20;
    @observable partitionPageSize = 20;


    @observable quickSearch = '';

}

const uiSettings = observable({
    sideBarOpen: true,
    selectedClusterIndex: 0,
    perTopicSettings: [] as TopicDetailsSettings[], // don't use directly, instead use uiState.topicDetails
    topicDetailsActiveTabKey: undefined as TopicTabId | undefined,

    topicDetailsShowStatisticsBar: true, // for now: global for all topic details

    // todo: refactor into: brokers.list, brokers.detail, topics.messages, topics.config, ...
    brokerList: {
        hideEmptyColumns: false,
        pageSize: DEFAULT_TABLE_PAGE_SIZE,

        valueDisplay: 'friendly' as 'friendly' | 'raw',
        propsFilter: 'onlyChanged' as 'all' | 'onlyChanged',
        propsOrder: 'alphabetical' as 'changedFirst' | 'default' | 'alphabetical',
    },

    topicList: {
        valueDisplay: 'friendly' as 'friendly' | 'both' | 'raw',
        propsOrder: 'changedFirst' as 'changedFirst' | 'default',
        propsFilter: 'all' as 'all' | 'onlyChanged',
        hideInternalTopics: true,
        pageSize: DEFAULT_TABLE_PAGE_SIZE, // number of topics to show
        quickSearch: '',
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

    schemaList: {
        pageSize: DEFAULT_TABLE_PAGE_SIZE,
        quickSearch: ''
    },

    schemaDetails: {
        viewMode: 'fields' as 'json' | 'fields',
    },

    previewNotificationHideUntil: 0, // utc seconds

    userDefaults: {
        paginationPosition: 'bottomRight' as ('bottomRight' | 'topRight'),
    }
});
export { uiSettings };



//
// Settings save/load

// Load settings
let storedSettingsJson = localStorage.getItem(settingsName);
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

