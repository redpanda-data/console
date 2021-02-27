/*eslint block-scoped-var: "error"*/

import {
    GetTopicsResponse, TopicDetail, GetConsumerGroupsResponse, GroupDescription, UserData,
    TopicConfigEntry, ClusterInfo, TopicMessage, TopicConfigResponse,
    ClusterInfoResponse, GetPartitionsResponse, Partition, GetTopicConsumersResponse, TopicConsumer, AdminInfo, TopicPermissions, ClusterConfigResponse, ClusterConfig, TopicDocumentationResponse, AclRequest, AclResponse, AclResource, SchemaOverview, SchemaOverviewRequestError, SchemaOverviewResponse, SchemaDetailsResponse, SchemaDetails, TopicDocumentation, TopicDescription, ApiError, PartitionReassignmentsResponse, PartitionReassignments, PartitionReassignmentRequest, AlterPartitionReassignmentsResponse
} from "./restInterfaces";
import { observable } from "mobx";
import fetchWithTimeout from "../utils/fetchWithTimeout";
import { toJson, LazyMap, TimeSince, clone } from "../utils/utils";
import env, { IsDev, IsBusiness, basePathS } from "../utils/env";
import { appGlobal } from "./appGlobal";
import { ServerVersionInfo, uiState } from "./uiState";
import { notification } from "antd";
import { ObjToKv } from "../utils/tsxUtils";

const REST_TIMEOUT_SEC = 25;
export const REST_CACHE_DURATION_SEC = 20;
const REST_DEBUG_BASE_URL = null// || "http://localhost:9090"; // only uncommented using "npm run build && serve -s build"

export async function rest<T>(url: string, timeoutSec: number = REST_TIMEOUT_SEC, requestInit?: RequestInit): Promise<T | null> {

    if (REST_DEBUG_BASE_URL) {
        url = REST_DEBUG_BASE_URL + url;
        if (!requestInit) requestInit = {};
        requestInit.mode = "no-cors";
        requestInit.cache = "no-cache";
    }

    const res = await fetchWithTimeout(url, timeoutSec * 1000, requestInit);

    if (res.status == 401) { // Unauthorized
        await handle401(res);
    }
    if (res.status == 403) { // Forbidden
        return null;
    }

    try {
        for (const [k, v] of res.headers) {
            if (k.toLowerCase() == 'app-version') {
                const serverVersion = JSON.parse(v) as ServerVersionInfo;
                if (typeof serverVersion === 'object')
                    if (uiState.serverVersion == null || (serverVersion.ts != uiState.serverVersion.ts))
                        uiState.serverVersion = serverVersion;
                break;
            }
        }
    } catch { } // Catch malformed json (old versions where info is not sent as json yet)

    if (!res.ok) {
        const text = await res.text();
        try {
            const errObj = JSON.parse(text) as ApiError;
            if (errObj && typeof errObj.statusCode !== "undefined" && typeof errObj.message != "undefined") {
                // if the shape matches, reformat it a bit
                throw new Error(`${errObj.message} (${res.status} - ${res.statusText})`);
            }
        }
        catch { } // response is not json

        // use generic error text
        throw new Error(`${text} (${res.status} - ${res.statusText})`);
    }

    const str = await res.text();
    // console.log('json: ' + str);
    const data = (JSON.parse(str) as T);
    return data;
}

async function handle401(res: Response) {
    // Logout
    //   Clear our 'User' data if we have any
    //   Any old/invalid JWT will be cleared by the server
    api.userData = null;

    try {
        const text = await res.text();
        const obj = JSON.parse(text);
        console.log("unauthorized message: " + text);

        const err = obj as ApiError;
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
            const index = api.activeRequests.indexOf(this);
            if (index > -1) {
                api.activeRequests.splice(index, 1);
            }
            self.isPending = false;
        });

        api.activeRequests.push(this);
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

async function getSchemaOverview(force?: boolean) {
    return cachedApiRequest('./api/schemas', force) as Promise<SchemaOverviewResponse>
}

async function getSchemaDetails(subjectName: string, version?: number | 'latest', force?: boolean) {
    if (version == null) version = 'latest';
    return cachedApiRequest(`./api/schemas/subjects/${subjectName}/versions/${version}`, force) as Promise<SchemaDetailsResponse>;
}


let currentWS: WebSocket | null = null;

//
// BackendAPI
//
const apiStore = {

    // Data
    clusters: ['A', 'B', 'C'],
    clusterInfo: null as (ClusterInfo | null),
    clusterConfig: null as (ClusterConfig | null),
    adminInfo: undefined as (AdminInfo | undefined | null),

    schemaOverview: undefined as (SchemaOverview | null | undefined), // undefined = request not yet complete; null = server responded with 'there is no data'
    schemaOverviewIsConfigured: undefined as boolean | undefined,
    schemaDetails: null as (SchemaDetails | null),

    topics: null as (TopicDetail[] | null),
    topicConfig: new Map<string, TopicDescription | null>(), // null = not allowed to view config of this topic
    topicDocumentation: new Map<string, TopicDocumentation>(),
    topicPermissions: new Map<string, TopicPermissions | null>(),
    topicPartitions: new Map<string, Partition[] | null>(), // null = not allowed to view partitions of this config
    topicConsumers: new Map<string, TopicConsumer[]>(),

    ACLs: undefined as AclResource[] | undefined | null,

    consumerGroups: null as (GroupDescription[] | null),

    partitionReassignments: undefined as (PartitionReassignments[] | null | undefined),

    // undefined = we haven't checked yet
    // null = call completed, and we're not logged in
    userData: undefined as (UserData | null | undefined),
    async logout() {
        await fetch('./logout');
        this.userData = null;
    },

    // Make currently running requests observable
    activeRequests: [] as CacheEntry[],

    // Fetch errors
    errors: [] as any[],


    messageSearchPhase: null as string | null,
    messagesFor: '', // for what topic?
    messages: [] as TopicMessage[],
    messagesElapsedMs: null as null | number,
    messagesBytesConsumed: 0,
    messagesTotalConsumed: 0,


    async startMessageSearch(searchRequest: MessageSearchRequest): Promise<void> {

        const isHttps = window.location.protocol.startsWith('https');
        const protocol = isHttps ? 'wss://' : 'ws://';
        const host = IsDev ? 'localhost:9090' : window.location.host;
        const url = protocol + host + basePathS + '/api/topics/' + searchRequest.topicName + '/messages';

        console.debug("connecting to \"" + url + "\"");

        // Abort previous connection
        if (currentWS != null)
            if (currentWS.readyState == WebSocket.OPEN || currentWS.readyState == WebSocket.CONNECTING)
                currentWS.close();

        currentWS = new WebSocket(url);
        const ws = currentWS;
        this.messageSearchPhase = "Connecting";
        this.messagesBytesConsumed = 0;
        this.messagesTotalConsumed = 0;

        currentWS.onopen = ev => {
            if (ws !== currentWS) return; // newer request has taken over
            // reset state for new request
            this.messagesFor = searchRequest.topicName;
            this.messages = [];
            this.messagesElapsedMs = null;
            // send new request
            currentWS.send(JSON.stringify(searchRequest));
        }
        currentWS.onclose = ev => {
            if (ws !== currentWS) return;
            api.stopMessageSearch();
            // double assignment makes sense: when the phase changes to null, some observing components will play a "fade out" animation, using the last (non-null) value
            console.debug(`ws closed: code=${ev.code} wasClean=${ev.wasClean}` + (ev.reason ? ` reason=${ev.reason}` : ''))
        }

        const onMessageHandler = (msgEvent: MessageEvent) => {
            if (ws !== currentWS) return;
            const msg = JSON.parse(msgEvent.data)

            switch (msg.type) {
                case 'phase':
                    this.messageSearchPhase = msg.phase;
                    break;

                case 'progressUpdate':
                    this.messagesBytesConsumed = msg.bytesConsumed;
                    this.messagesTotalConsumed = msg.messagesConsumed;
                    break;

                case 'done':
                    this.messagesElapsedMs = msg.elapsedMs;
                    this.messagesBytesConsumed = msg.bytesConsumed;
                    // this.MessageSearchCancelled = msg.isCancelled;
                    this.messageSearchPhase = "Done";
                    this.messageSearchPhase = null;
                    break;

                case 'error':
                    // error doesn't neccesarily mean the whole request is done
                    console.info("ws backend error: " + msg.message);
                    const notificationKey = `errorNotification-${Date.now()}`;
                    notification['error']({
                        key: notificationKey,
                        message: "Backend Error",
                        description: msg.message,
                        duration: 5,
                    })
                    break;

                case 'message':
                    let m = msg.message as TopicMessage;

                    const keyData = m.key.payload;
                    if (keyData != null && keyData != undefined && keyData != "" && m.key.encoding == 'binary') {
                        try {
                            m.key.payload = atob(m.key.payload); // unpack base64 encoded key
                        } catch (error) {
                            // Empty
                            // Only unpack if the key is base64 based
                        }
                    }

                    // debugModifyHeaders(m);

                    m.valueJson = JSON.stringify(m.value.payload);

                    if (m.value.encoding == 'binary') {
                        m.value.payload = atob(m.value.payload);

                        const str = m.value.payload as string;
                        let hex = '';
                        for (let i = 0; i < str.length && i < 50; i++) {
                            let n = str.charCodeAt(i).toString(16);
                            if (n.length == 1) n = '0' + n;
                            hex += n + ' ';
                        }
                        m.valueBinHexPreview = hex;
                    }


                    //m = observable.object(m, undefined, { deep: false });

                    this.messages.push(m);
                    break;
            }
        };
        //currentWS.onmessage = m => transaction(() => onMessageHandler(m));
        currentWS.onmessage = onMessageHandler;
    },

    stopMessageSearch() {
        if (currentWS) {
            currentWS.close();
            currentWS = null;
        }

        if (this.messageSearchPhase != null) {
            this.messageSearchPhase = "Done";
            this.messagesBytesConsumed = 0;
            this.messagesTotalConsumed = 0;
            this.messageSearchPhase = null;
        }
    },

    refreshTopics(force?: boolean) {
        cachedApiRequest<GetTopicsResponse>('./api/topics', force)
            .then(v => {
                for (const t of v.topics) {
                    if (!t.allowedActions) continue;

                    // DEBUG: randomly remove some allowedActions
                    /*
                    const numToRemove = Math.round(Math.random() * t.allowedActions.length);
                    for (let i = 0; i < numToRemove; i++) {
                        const randomIndex = Math.round(Math.random() * (t.allowedActions.length - 1));
                        t.allowedActions.splice(randomIndex, 1);
                    }
                    */
                }
                this.topics = v.topics;
            }, addError);
    },

    refreshTopicConfig(topicName: string, force?: boolean) {
        cachedApiRequest<TopicConfigResponse | null>(`./api/topics/${topicName}/configuration`, force)
            .then(v => this.topicConfig.set(topicName, v?.topicDescription ?? null), addError); // 403 -> null
    },

    refreshTopicDocumentation(topicName: string, force?: boolean) {
        cachedApiRequest<TopicDocumentationResponse>(`./api/topics/${topicName}/documentation`, force)
            .then(v => {
                const text = v.documentation.markdown == null ? null : atob(v.documentation.markdown);
                v.documentation.text = text;
                this.topicDocumentation.set(topicName, v.documentation);
            }, addError);
    },

    refreshTopicPermissions(topicName: string, force?: boolean) {
        if (!IsBusiness) return; // permissions endpoint only exists in kowl-business
        cachedApiRequest<TopicPermissions | null>(`./api/permissions/topics/${topicName}`, force)
            .then(x => this.topicPermissions.set(topicName, x), addError);
    },

    refreshTopicPartitions(topicName: string, force?: boolean) {
        cachedApiRequest<GetPartitionsResponse | null>(`./api/topics/${topicName}/partitions`, force)
            .then(response => {
                if (response != null) {
                    for (const p of response.partitions) {
                        const replicaSize = p.partitionLogDirs.max(e => e.size);
                        p.replicaSize = replicaSize >= 0 ? replicaSize : 0;
                    }
                    this.topicPartitions.set(topicName, response.partitions);
                } else {
                    this.topicPartitions.set(topicName, null);
                }
            }, addError);
    },

    refreshTopicConsumers(topicName: string, force?: boolean) {
        cachedApiRequest<GetTopicConsumersResponse>(`./api/topics/${topicName}/consumers`, force)
            .then(v => this.topicConsumers.set(topicName, v.topicConsumers), addError);
    },

    refreshAcls(request: AclRequest, force?: boolean) {
        const query = aclRequestToQuery(request);
        cachedApiRequest<AclResponse | null>(`./api/acls?${query}`, force)
            .then(v => this.ACLs = v?.aclResources ?? null, addError);
    },

    refreshCluster(force?: boolean) {
        cachedApiRequest<ClusterInfoResponse>(`./api/cluster`, force)
            .then(v => this.clusterInfo = v.clusterInfo, addError);
    },

    refreshClusterConfig(force?: boolean) {
        cachedApiRequest<ClusterConfigResponse>(`./api/cluster/config`, force)
            .then(v => this.clusterConfig = v.clusterConfig, addError);
    },

    refreshConsumerGroups(force?: boolean) {
        cachedApiRequest<GetConsumerGroupsResponse>('./api/consumer-groups', force)
            .then(v => {
                for (const g of v.consumerGroups) {
                    g.lagSum = g.lag.topicLags.sum(t => t.summedLag);
                }
                this.consumerGroups = v.consumerGroups;
            }, addError);
    },

    refreshAdminInfo(force?: boolean) {
        cachedApiRequest<AdminInfo | null>(`./api/admin`, force)
            .then(info => {
                if (info == null) {
                    this.adminInfo = null;
                    return;
                }

                // normalize responses (missing arrays, or arrays with an empty string)
                // todo: not needed anymore, responses are always correct now
                for (const role of info.roles)
                    for (const permission of role.permissions)
                        for (const k of ['allowedActions', 'includes', 'excludes']) {
                            const ar: string[] = (permission as any)[k] ?? [];
                            (permission as any)[k] = ar.filter(x => x.length > 0);
                        }

                // resolve role of each binding
                for (const binding of info.roleBindings) {
                    binding.resolvedRole = info.roles.first(r => r.name == binding.roleName)!;
                    if (binding.resolvedRole == null) console.error("could not resolve roleBinding to role: " + toJson(binding));
                }

                // resolve bindings, and roles of each user
                for (const user of info.users) {
                    user.bindings = user.bindingIds.map(id => info.roleBindings.first(rb => rb.ephemeralId == id)!);
                    if (user.bindings.any(b => b == null)) console.error("one or more rolebindings could not be resolved for user: " + toJson(user));

                    user.grantedRoles = [];
                    for (const roleName in user.audits)
                        user.grantedRoles.push({
                            role: info.roles.first(r => r.name == roleName)!,
                            grantedBy: user.audits[roleName].map(bindingId => info.roleBindings.first(b => b.ephemeralId == bindingId)!),
                        });
                }

                this.adminInfo = info;
            }, addError);
    },

    refreshSchemaOverview(force?: boolean) {
        getSchemaOverview(force)
            .then(({ schemaOverview, isConfigured }) => [this.schemaOverview, this.schemaOverviewIsConfigured] = [schemaOverview, isConfigured])
            .catch(addError)
    },

    refreshSchemaDetails(subjectName: string, version: number | 'latest', force?: boolean) {
        getSchemaDetails(subjectName, version, force)
            .then(({ schemaDetails }) => (this.schemaDetails = schemaDetails))
            .catch(addError)
    },

    refreshPartitionReassignments(force?: boolean) {
        cachedApiRequest<PartitionReassignmentsResponse | null>('./operations/reassign-partitions', force)
            .then(v => {
                if (v === null)
                    this.partitionReassignments = null;
                else
                    this.partitionReassignments = v.topics;
            }, addError);
    },

    async startPartitionReassignment(request: PartitionReassignmentRequest): Promise<AlterPartitionReassignmentsResponse> {
        const response = await fetch('./api/operations/reassign-partitions', {
            method: 'PATCH',
            headers: [
                ['Content-Type', 'application/json']
            ],
            body: toJson(request),
        });

        if (!response.ok) {
            const text = await response.text();
            try {
                const errObj = JSON.parse(text) as ApiError;
                if (errObj && typeof errObj.statusCode !== "undefined" && typeof errObj.message != "undefined") {
                    // if the shape matches, reformat it a bit
                    throw new Error(`${errObj.message} (${response.status} - ${response.statusText})`);
                }
            }
            catch { } // not json

            // use generic error text
            throw new Error(`${text} (${response.status} - ${response.statusText})`);
        }

        const str = await response.text();
        const data = (JSON.parse(str) as AlterPartitionReassignmentsResponse);
        return data;
    },
}

export function aclRequestToQuery(request: AclRequest): string {
    const filters = ObjToKv(request).filter(kv => !!kv.value);
    const query = filters.map(x => `${x.key}=${x.value}`).join('&');
    return query;
}

export interface MessageSearchRequest {
    topicName: string,
    startOffset: number,
    partitionId: number,
    maxResults: number, // should also support '-1' soon, so we can do live tailing
    filterInterpreterCode: string, // js code, base64 encoded
}


function addError(err: Error) {
    api.errors.push(err);
    // notification['error']({
    // 	message: 'REST: ' + err.name,
    // 	description: err.message,
    // 	duration: 7
    // })
}


type apiStoreType = typeof apiStore;
export const api = observable(apiStore, { messages: observable.shallow }) as apiStoreType;

/*
autorun(r => {
    console.log(toJson(api))
    touch(api)
}, { delay: 50, name: 'api observer' });
*/


function debugModifyHeaders(m: TopicMessage) {
    m.headers.splice(0);
    m.headers.push({ key: 'DEBUG TEST LONG NAME HERE', value: { encoding: 'text', payload: { a: 1, b: 2, c: { x: 'asdas', y: '4545' } }, size: 92385469213587923958, avroSchemaId: 0 } })
    m.headers.push({
        key: 'long object', value: {
            encoding: 'text', payload: {
                a: {
                    b: {
                        c: {
                            d: {
                                text: `
                        // DeserializePayload tries to deserialize a given byte array.
                        // The payload's byte array may represent
                        //  - an encoded message such as JSON, Avro or XML
                        //  - UTF-8 Text
                        //  - Binary content
                        // Idea: Add encoding hint where user can suggest the backend to test this encoding first.
                        func (d *deserializer) DeserializePayload(payload []byte, topicName string, recordType proto.RecordPropertyType) *deserializedPayload {
                            if len(payload) == 0 {
                                return &deserializedPayload{Payload: normalizedPayload{
                                    Payload:            payload,
                                    RecognizedEncoding: messageEncodingNone,
                                }, Object: "", RecognizedEncoding: messageEncodingNone, Size: len(payload)}
                            }
                        `
                            }
                        }
                    }
                }
            }, size: -1, avroSchemaId: 0
        }
    });
    m.headers.push({
        key: 'long text', value: {
            encoding: 'text', payload: `
                    // DeserializePayload tries to deserialize a given byte array.
                    // The payload's byte array may represent
                    //  - an encoded message such as JSON, Avro or XML
                    //  - UTF-8 Text
                    //  - Binary content
                    // Idea: Add encoding hint where user can suggest the backend to test this encoding first.
                    func (d *deserializer) DeserializePayload(payload []byte, topicName string, recordType proto.RecordPropertyType) *deserializedPayload {
                        if len(payload) == 0 {
                            return &deserializedPayload{Payload: normalizedPayload{
                                Payload:            payload,
                                RecognizedEncoding: messageEncodingNone,
                            }, Object: "", RecognizedEncoding: messageEncodingNone, Size: len(payload)}
                        }
                    `, size: Infinity, avroSchemaId: 0
        }
    });
    m.headers.push({ key: '>null', value: { encoding: 'text', payload: null, size: Infinity, avroSchemaId: 0 } });
    m.headers.push({ key: '>undefined', value: { encoding: 'text', payload: undefined, size: Infinity, avroSchemaId: 0 } });
    m.headers.push({ key: '>NaN', value: { encoding: 'text', payload: NaN, size: Infinity, avroSchemaId: 0 } });
    m.headers.push({ key: '>0', value: { encoding: 'text', payload: 0, size: Infinity, avroSchemaId: 0 } });
    m.headers.push({ key: '>missing', value: { encoding: 'text', size: Infinity, avroSchemaId: 0 } as any });
    m.headers.push({ key: '>{}', value: { encoding: 'text', payload: {}, size: 0, avroSchemaId: 0 } });
    m.headers.push({ key: '>5', value: { encoding: 'text', payload: 5, size: NaN, avroSchemaId: 0 } });
    m.headers.push({ key: '>object', value: { encoding: 'text', payload: { a: {} }, size: -1, avroSchemaId: 0 } });

}