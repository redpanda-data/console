/*eslint block-scoped-var: "error"*/

import {
    GetTopicsResponse, TopicDetail, GetConsumerGroupsResponse, GroupDescription, UserData,
    TopicConfigEntry, ClusterInfo, TopicMessage, TopicConfigResponse,
    ClusterInfoResponse, GetTopicMessagesResponse, ListMessageResponse, GetPartitionsResponse, Partition
} from "./restInterfaces";
import { observable, autorun, computed } from "mobx";
import fetchWithTimeout from "../utils/fetchWithTimeout";
import { ToJson, touch, Cooldown, LazyMap, Timer, TimeSince } from "../utils/utils";
import { objToQuery } from "../utils/queryHelper";
import { IsDevelopment } from "../utils/isProd";
import { appGlobal } from "./appGlobal";
import { uiState } from "./uiState";

const REST_TIMEOUT_SEC = IsDevelopment ? 5 : 25;
const REST_CACHE_DURATION_SEC = 20;


export async function rest<T>(url: string, timeoutSec: number = REST_TIMEOUT_SEC, requestInit?: RequestInit): Promise<T> {
    const res = await fetchWithTimeout(url, timeoutSec * 1000, requestInit);

    if (res.status == 401) {
        handleUnauthorized();
    }
    if (res.status == 403) {
        handleForbidden();
    }

    if (!res.ok)
        throw new Error("(" + res.status + ") " + res.statusText);

    const str = await res.text();
    // console.log('json: ' + str);
    const data = (JSON.parse(str) as T);
    return data;
}

function handleUnauthorized() {
    // Logout
    //   Clear our 'User' data if we have any
    //   Any old/invalid JWT will be cleared by the server
    api.UserData = null;

    // Save current location url
    // store.urlBeforeLogin = window.location.href;

    // Redirect to login
    appGlobal.history.push('/login');
}

function handleForbidden() {
    uiState.loginError = 'accessDenied';
    appGlobal.history.push('/login');
}

const cache = new LazyMap<string, CacheEntry>(u => new CacheEntry(u));
class CacheEntry {
    url: string;

    private timeSinceLastResult = new TimeSince(); // set automatically
    /** How long ago (in seconds) the data was last updated */
    get resultAge() { return this.timeSinceLastResult.value / 1000; }

    private promise: Promise<any>;
    get lastPromise() { return this.promise; }
    setPromise<T>(promise: Promise<T>) {
        this.timeSinceRequestStarted.reset();

        const self = this;
        this.isPending = true;
        api.ActiveRequests.push(this);
        this.promise = promise;

        promise.then(
            function onFulfilled(result: T) {
                self.timeSinceLastResult.reset();
                self.lastResult = result;
            },
            function onRejected(reason: any) {
            }
        ).finally(() => {
            self.lastRequestTime = self.timeSinceRequestStarted.value;
            const index = api.ActiveRequests.indexOf(this);
            if (index > -1) {
                api.ActiveRequests.splice(index, 1);
            }
            self.isPending = false;
        });
    }

    lastResult: any | undefined; // set automatically
    isPending: boolean; // set automatically

    private timeSinceRequestStarted = new TimeSince(); // set automatically
    private lastRequestTime: number; // set automatically
    /** How long (in seconds) the last request took (or is currently taking so far) */
    get requestTime() {
        if (this.isPending) {
            return this.timeSinceRequestStarted.value / 1000;
        }
        return this.lastRequestTime / 1000;
    }

    constructor(url: string) {
        this.url = url;
        const sec = 1000;
        const min = 60 * sec;
        const h = 60 * min;
        this.timeSinceLastResult.reset(100 * h);
    }
}

function cachedApiRequest<T>(url: string, force: boolean = false): Promise<T> {
    const entry = cache.get(url);

    if (entry.isPending)
        return entry.lastPromise;

    if (entry.resultAge > REST_CACHE_DURATION_SEC || force) {
        // Start request
        const promise = rest<T>(url); //.catch(r => { throw new Error(url) });
        entry.setPromise(promise);
    }

    // Not ready yet, don't update, return last result
    return entry.lastPromise;
}



//
// BackendAPI
//
const apiStore = {

    // Data
    Clusters: ['BigData Prod', 'BigData Staging', 'BigData Dev'],
    Topics: null as (TopicDetail[] | null),
    ConsumerGroups: null as (GroupDescription[] | null),
    TopicConfig: new Map<string, TopicConfigEntry[]>(),
    TopicPartitions: new Map<string, Partition[]>(),
    ClusterInfo: null as (ClusterInfo | null),

    UserData: null as (UserData | null),
    async logout() {
        await fetch('/logout');
        this.UserData = null;
    },

    // Make currently running requests observable
    ActiveRequests: [] as CacheEntry[],

    // Fetch errors
    Errors: [] as any[],


    MessagesFor: '', // for what topic?
    Messages: [] as TopicMessage[],
    MessageResponse: {} as ListMessageResponse,

    async searchTopicMessages(topicName: string, searchParams: TopicMessageSearchParameters): Promise<void> {
        const clone = JSON.parse(JSON.stringify(searchParams)) as TopicMessageSearchParameters;
        (clone as any)._offsetMode = undefined;
        const queryString = objToQuery(clone);


        let response: GetTopicMessagesResponse;
        try {
            response = await rest<GetTopicMessagesResponse>('/api/topics/' + topicName + '/messages' + queryString);
        } finally {
            this.clearMessageCache();
        }


        this.MessagesFor = topicName;
        for (let m of response.kafkaMessages.messages) {
            //console.dir(m);

            if (m.key && typeof m.key === 'string' && m.key.length > 0)
                m.key = atob(m.key); // unpack base64 encoded key

            m.valueJson = JSON.stringify(m.value);

            if (m.valueType == 'binary') {
                m.value = atob(m.value);

                const str = m.value as string;
                var hex = '';
                for (var i = 0; i < str.length && i < 50; i++) {
                    let n = str.charCodeAt(i).toString(16);
                    if (n.length == 1) n = '0' + n;
                    hex += n + ' ';
                }
                m.valueBinHexPreview = hex;
            }
        }
        this.MessageResponse = response.kafkaMessages;
        this.Messages = response.kafkaMessages.messages;
    },

    clearMessageCache() {
        this.MessageResponse = {} as ListMessageResponse;
        this.MessagesFor = '';
        this.Messages = [];
    },



    refreshTopics(force?: boolean) {
        cachedApiRequest<GetTopicsResponse>('/api/topics', force)
            .then(v => {
                for (let t of v.topics) {
                    // t.messageCount = ...
                }

                this.Topics = v.topics;
            }, addError);
    },

    refreshConsumerGroups(force?: boolean) {
        cachedApiRequest<GetConsumerGroupsResponse>('/api/consumer-groups', force)
            .then(v => {
                for (let g of v.consumerGroups) {
                    g.lagSum = g.lag.topicLags.map(t => t.summedLag).reduce((a, b) => a + b, 0)
                }
                this.ConsumerGroups = v.consumerGroups;
            }, addError);
    },

    refreshTopicConfig(topicName: string, force?: boolean) {
        cachedApiRequest<TopicConfigResponse>(`/api/topics/${topicName}/configuration`, force)
            .then(v => this.TopicConfig.set(v.topicDescription.topicName, v.topicDescription.configEntries), addError);
    },

    refreshTopicPartitions(topicName: string, force?: boolean) {
        cachedApiRequest<GetPartitionsResponse>(`/api/topics/${topicName}/partitions`, force)
            .then(v => this.TopicPartitions.set(v.topicName, v.partitions), addError);
    },

    refreshCluster(force?: boolean) {
        cachedApiRequest<ClusterInfoResponse>(`/api/cluster`, force)
            .then(v => this.ClusterInfo = v.clusterInfo, addError);
    },
}

export enum TopicMessageOffset { End = -1, Start = -2, Custom = 0 }
export enum TopicMessageSortBy { Offset, Timestamp }
export enum TopicMessageDirection { Descending, Ascending }
export interface TopicMessageSearchParameters {
    _offsetMode: TopicMessageOffset;
    startOffset: number;
    partitionID: number;
    pageSize: number;
    sortType: TopicMessageSortBy;
    sortOrder: TopicMessageDirection;
}


function addError(err: Error) {
    api.Errors.push(err);
    // notification['error']({
    // 	message: 'REST: ' + err.name,
    // 	description: err.message,
    // 	duration: 7
    // })
}


type apiStoreType = typeof apiStore;
export const api = observable(apiStore) as apiStoreType;

/*
autorun(r => {
    console.log(toJson(api))
    touch(api)
}, { delay: 50, name: 'api observer' });
*/
