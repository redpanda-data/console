/*eslint block-scoped-var: "error"*/

import {
    GetTopicsResponse, TopicDetail, GetConsumerGroupsResponse, GroupDescription, UserData,
    TopicConfigEntry, ClusterInfo, TopicMessage, TopicConfigResponse,
    ClusterInfoResponse, GetTopicMessagesResponse, ListMessageResponse, GetPartitionsResponse, Partition, GetTopicConsumersResponse, TopicConsumer, AdminInfo
} from "./restInterfaces";
import { observable, autorun, computed } from "mobx";
import fetchWithTimeout from "../utils/fetchWithTimeout";
import { ToJson, touch, Cooldown, LazyMap, Timer, TimeSince } from "../utils/utils";
import { objToQuery } from "../utils/queryHelper";
import { IsDev } from "../utils/env";
import { appGlobal } from "./appGlobal";
import { uiState } from "./uiState";
import { notification } from "antd";

const REST_TIMEOUT_SEC = IsDev ? 5 : 25;
const REST_CACHE_DURATION_SEC = 20;
const REST_DEBUG_BASE_URL = null// || "http://localhost:9090"; // only uncommented using "npm run build && serve -s build"

export async function rest<T>(url: string, timeoutSec: number = REST_TIMEOUT_SEC, requestInit?: RequestInit): Promise<T> {

    if (REST_DEBUG_BASE_URL) {
        url = REST_DEBUG_BASE_URL + url;
        if (!requestInit) requestInit = {};
        requestInit.mode = "no-cors";
        requestInit.cache = "no-cache";
    }

    const res = await fetchWithTimeout(url, timeoutSec * 1000, requestInit);

    if (res.status == 401) {
        await handleUnauthorized401(res);
    }

    if (!res.ok)
        throw new Error("(" + res.status + ") " + res.statusText);

    const str = await res.text();
    // console.log('json: ' + str);
    const data = (JSON.parse(str) as T);
    return data;
}

async function handleUnauthorized401(res: Response) {
    // Logout
    //   Clear our 'User' data if we have any
    //   Any old/invalid JWT will be cleared by the server
    api.UserData = null;

    try {
        const text = await res.text();
        const obj = JSON.parse(text);
        console.log("unauthorized message: " + text);

        const err = obj as { statusCode: number, message: string }
        uiState.loginError = String(err.message);
    } catch (err) {
        uiState.loginError = String(err);
    }

    // Save current location url
    // store.urlBeforeLogin = window.location.href;

    // Redirect to login
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

        api.ActiveRequests.push(this);
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

    if (entry.isPending) {
        // console.log("debug: request already pending", entry);
        return entry.lastPromise;
    }

    if (entry.resultAge > REST_CACHE_DURATION_SEC || force) {
        // Start or refresh request
        // console.log("debug: refreshing...", entry);

        const promise = rest<T>(url); //.catch(r => { throw new Error(url) });
        entry.setPromise(promise);

    } else {
        // console.log("debug: cached request still valid??", entry);
    }

    // Not ready yet, don't update, return last result
    return entry.lastPromise;
}


let currentWS: WebSocket | null = null;

//
// BackendAPI
//
const apiStore = {

    // Data
    Clusters: ['BigData Prod', 'BigData Staging', 'BigData Dev'],
    ClusterInfo: null as (ClusterInfo | null),
    AdminInfo: null as (AdminInfo | null),

    Topics: null as (TopicDetail[] | null),
    TopicConfig: new Map<string, TopicConfigEntry[] | null>(), // null = not allowed to view config of this topic
    TopicPartitions: new Map<string, Partition[] | null>(), // null = not allowed to view partitions of this config
    TopicConsumers: new Map<string, TopicConsumer[]>(),

    ConsumerGroups: null as (GroupDescription[] | null),


    // undefined = we haven't checked yet
    // null = call completed, and we're not logged in
    UserData: undefined as (UserData | null | undefined),
    async logout() {
        await fetch('/logout');
        this.UserData = null;
    },

    // Make currently running requests observable
    ActiveRequests: [] as CacheEntry[],

    // Fetch errors
    Errors: [] as any[],


    MessageSearchPhase: null as string | null,
    MessagesFor: '', // for what topic?
    Messages: [] as TopicMessage[],
    MessagesElapsedMs: null as null | number,


    async startMessageSearch(topicName: string, searchParams: TopicMessageSearchParameters): Promise<void> {
        // remove 'offsetMode' and convert to queryString
        const clone = JSON.parse(JSON.stringify(searchParams)) as TopicMessageSearchParameters;
        (clone as any)._offsetMode = undefined;
        const queryString = objToQuery(clone);

        const isHttps = window.location.protocol.startsWith('https');
        const protocol = isHttps ? 'wss://' : 'ws://';
        const host = IsDev ? 'localhost:9090' : window.location.host;
        const url = protocol + host + '/api/topics/' + topicName + '/messages' + queryString;

        console.log("connecting to \"" + url + "\"");

        // Abort previous connection
        if (currentWS != null)
            if (currentWS.readyState == WebSocket.OPEN || currentWS.readyState == WebSocket.CONNECTING)
                currentWS.close();

        currentWS = new WebSocket(url);
        const ws = currentWS;
        this.MessageSearchPhase = "Connecting";

        currentWS.onopen = ev => {
            if (ws !== currentWS) return; // newer request has taken over
            this.MessagesFor = topicName;
            this.Messages = [];
            this.MessagesElapsedMs = null;
        }
        currentWS.onclose = ev => {
            if (ws !== currentWS) return;
            this.MessageSearchPhase = null;
            console.log(`ws closed: code=${ev.code} wasClean=${ev.wasClean}` + (ev.reason ? ` reason=${ev.reason}` : ''))
        }
        currentWS.onmessage = msgEvent => {
            if (ws !== currentWS) return;
            const msg = JSON.parse(msgEvent.data)

            switch (msg.type) {
                case 'phase':
                    this.MessageSearchPhase = msg.phase;
                    break;

                case 'done':
                    this.MessagesElapsedMs = msg.elapsedMs;
                    // this.MessageSearchCancelled = msg.isCancelled;
                    break;

                case 'error':
                    // error doesn't neccesarily mean the whole request is done
                    console.log("backend error: " + msg.message);
                    notification['error']({
                        message: "Backend Error",
                        description: msg.message,
                    })
                    break;

                case 'message':
                    const m = msg.message;

                    if (m.key && typeof m.key === 'string' && m.key.length > 0)
                        m.key = atob(m.key); // unpack base64 encoded key

                    m.valueJson = JSON.stringify(m.value);

                    if (m.valueType == 'binary') {
                        m.value = atob(m.value);

                        const str = m.value as string;
                        let hex = '';
                        for (let i = 0; i < str.length && i < 50; i++) {
                            let n = str.charCodeAt(i).toString(16);
                            if (n.length == 1) n = '0' + n;
                            hex += n + ' ';
                        }
                        m.valueBinHexPreview = hex;
                    }

                    this.Messages.push(m);
                    break;
            }
        }


    },


    refreshTopics(force?: boolean) {
        cachedApiRequest<GetTopicsResponse>('/api/topics', force)
            .then(v => {
                for (const t of v.topics) {
                    if (!t.allowedActions) continue;

                    // DEBUG: randomly remove some allowedActions
                    const numToRemove = Math.round(Math.random() * t.allowedActions.length);
                    for (let i = 0; i < numToRemove; i++) {
                        const randomIndex = Math.round(Math.random() * (t.allowedActions.length - 1));
                        t.allowedActions.splice(randomIndex, 1);
                    }
                }
                this.Topics = v.topics;
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

    refreshTopicConsumers(topicName: string, force?: boolean) {
        cachedApiRequest<GetTopicConsumersResponse>(`/api/topics/${topicName}/consumers`, force)
            .then(v => this.TopicConsumers.set(v.topicName, v.topicConsumers), addError);
    },


    refreshCluster(force?: boolean) {
        cachedApiRequest<ClusterInfoResponse>(`/api/cluster`, force)
            .then(v => this.ClusterInfo = v.clusterInfo, addError);
    },

    refreshConsumerGroups(force?: boolean) {
        cachedApiRequest<GetConsumerGroupsResponse>('/api/consumer-groups', force)
            .then(v => {
                for (const g of v.consumerGroups) {
                    g.lagSum = g.lag.topicLags.sum(t => t.summedLag);
                }
                this.ConsumerGroups = v.consumerGroups;
            }, addError);
    },

    refreshAdminInfo(force?: boolean) {
        cachedApiRequest<AdminInfo>(`/api/admin`, force)
            .then(v => {
                for (let u of v.users)
                    u.roles = u.roleNames.map(n => v.roles.find(r => r.name == n)!);
                this.AdminInfo = v
            }, addError);
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
