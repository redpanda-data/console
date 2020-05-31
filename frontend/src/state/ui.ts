import { observable, autorun } from "mobx";
import { touch, assignDeep } from "../utils/utils";
import { DEFAULT_TABLE_PAGE_SIZE } from "../components/misc/common";
import { TopicMessageOffset, TopicMessageDirection, TopicMessageSortBy, TopicMessageSearchParameters } from "./backendApi";
import { TopicDetailsTab } from "../components/pages/topics/Topic.Details";

const settingsName = 'uiSettings-v2';


/*
	todo:
	- remember UI settings using local storage
	- topic: message filter, display settings, ...
*/

export interface PreviewTag {
    value: string;
    active: boolean;
}

// Settings for an individual topic
export class TopicDetailsSettings {
    topicName: string;

    @observable searchParams: TopicMessageSearchParameters = {
        _offsetMode: TopicMessageOffset.End,
        startOffset: -1, partitionID: -1, pageSize: 50,
        sortOrder: TopicMessageDirection.Descending, sortType: TopicMessageSortBy.Offset
    };

    @observable pageSize = 20;
    @observable favConfigEntries: string[] = ['cleanup.policy', 'segment.bytes', 'segment.ms'];

    @observable previewTags = [] as PreviewTag[];
    @observable previewTagsCaseSensitive = false;

    @observable previewMultiResultMode = 'showAll' as 'showOnlyFirst' | 'showAll'; // maybe todo: 'limitTo'|'onlyCount' ?
    @observable previewShowResultCount = false;
    // @observable previewResultLimit: 3; // todo
    @observable previewShowEmptyMessages = true; // todo: filter out messages that don't match

    @observable quickSearch = '';
}


const uiSettings = observable({
    sideBarOpen: true,
    selectedClusterIndex: 0,
    perTopicSettings: [] as TopicDetailsSettings[], // don't use directly, instead use uiState.topicDetails
    topicDetailsActiveTabKey: undefined as TopicDetailsTab,

    // todo: refactor into: brokers.list, brokers.detail, topics.messages, topics.config, ...
    brokerList: {
        hideEmptyColumns: false,
        pageSize: DEFAULT_TABLE_PAGE_SIZE,
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
    assignDeep(uiSettings, loadedSettings);
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

