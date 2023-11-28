
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

/*eslint block-scoped-var: "error"*/

import { comparer, computed, observable, transaction } from 'mobx';
import { AppFeatures, getBasePath } from '../utils/env';
import fetchWithTimeout from '../utils/fetchWithTimeout';
import { toJson } from '../utils/jsonUtils';
import { LazyMap } from '../utils/LazyMap';
import { ObjToKv } from '../utils/tsxUtils';
import { base64ToHexString, decodeBase64, TimeSince, uint8ArrayToHexString } from '../utils/utils';
import { appGlobal } from './appGlobal';
import {
    GetAclsRequest, AclRequestDefault, GetAclOverviewResponse, AdminInfo,
    AlterConfigOperation, AlterPartitionReassignmentsResponse, ApiError,
    Broker, BrokerConfigResponse, ClusterAdditionalInfo, ClusterConnectors,
    ClusterInfo, ClusterInfoResponse, ConfigEntry, ConfigResourceType,
    ConnectorValidationResult, CreateTopicRequest, CreateTopicResponse,
    DeleteConsumerGroupOffsetsRequest, DeleteConsumerGroupOffsetsResponse,
    DeleteConsumerGroupOffsetsResponseTopic, DeleteConsumerGroupOffsetsTopic,
    DeleteRecordsResponseData, EditConsumerGroupOffsetsRequest,
    EditConsumerGroupOffsetsResponse, EditConsumerGroupOffsetsResponseTopic,
    EditConsumerGroupOffsetsTopic, EndpointCompatibility,
    EndpointCompatibilityResponse, GetAllPartitionsResponse,
    GetConsumerGroupResponse, GetConsumerGroupsResponse, GetPartitionsResponse,
    GetTopicConsumersResponse, GetTopicOffsetsByTimestampResponse,
    GetTopicsResponse, GroupDescription, isApiError, KafkaConnectors,
    PartialTopicConfigsResponse, Partition, PartitionReassignmentRequest,
    PartitionReassignments, PartitionReassignmentsResponse,
    PatchConfigsRequest, PatchConfigsResponse, ProduceRecordsResponse,
    PublishRecordsRequest, QuotaResponse, ResourceConfig,
    Topic, TopicConfigResponse, TopicConsumer, TopicDescription,
    TopicDocumentation, TopicDocumentationResponse, TopicOffset,
    TopicPermissions, UserData, WrappedApiError, CreateACLRequest,
    DeleteACLsRequest, RedpandaLicense, AclResource, GetUsersResponse, CreateUserRequest,
    PatchTopicConfigsRequest, CreateSecretResponse, ClusterOverview, BrokerWithConfigAndStorage,
    OverviewNewsEntry,
    Payload,
    SchemaRegistrySubject,
    SchemaRegistrySubjectDetails,
    SchemaRegistryModeResponse,
    SchemaRegistryConfigResponse,
    SchemaRegistrySchemaTypesResponse,
    SchemaRegistryCreateSchemaResponse,
    SchemaRegistryCreateSchema,
    SchemaRegistryDeleteSubjectVersionResponse,
    SchemaRegistryDeleteSubjectResponse,
    SchemaRegistryCompatibilityMode,
    SchemaRegistrySetCompatibilityModeRequest,
    SchemaReferencedByEntry,
    SchemaRegistryValidateSchemaResponse,
    SchemaVersion,
    TopicMessage,
    CompressionType
} from './restInterfaces';
import { uiState } from './uiState';
import { config as appConfig, isEmbedded } from '../config';
import { createStandaloneToast, redpandaTheme, redpandaToastOptions } from '@redpanda-data/ui';

import { createPromiseClient } from '@connectrpc/connect';
import { createConnectTransport } from '@connectrpc/connect-web';
import { proto3 } from '@bufbuild/protobuf';
import { ConsoleService } from '../protogen/redpanda/api/console/v1alpha1/console_service_connect';
import { ListMessagesRequest } from '../protogen/redpanda/api/console/v1alpha1/list_messages_pb';
import { PayloadEncoding, CompressionType as ProtoCompressionType } from '../protogen/redpanda/api/console/v1alpha1/common_pb';
import { PublishMessageRequest, PublishMessageResponse } from '../protogen/redpanda/api/console/v1alpha1/publish_messages_pb';

const REST_TIMEOUT_SEC = 25;
export const REST_CACHE_DURATION_SEC = 20;

const { toast } = createStandaloneToast({
    theme: redpandaTheme,
    defaultOptions: redpandaToastOptions.defaultOptions
})

/*
    - If statusCode is not 2xx (any sort of error) -> response content will always be an `ApiError` json object
    - 2xx does not mean complete success, for some endpoints (e.g.: broker log dirs) we can get partial responses (array with some result entries and some error entries)
*/

/*
* allow custom fetch or websocket interceptors
* */
export async function rest<T>(url: string, requestInit?: RequestInit): Promise<T | null> {
    const res = await fetchWithTimeout(url, REST_TIMEOUT_SEC * 1000, requestInit);

    if (res.status == 401) { // Unauthorized
        await handle401(res);
        return null;
    }
    if (res.status == 403) { // Forbidden
        return null;
    }

    const text = await res.text();

    processVersionInfo(res.headers);

    return parseOrUnwrap<T>(res, text);
}

async function handle401(res: Response) {
    // Logout
    //   Clear our 'User' data if we have any
    //   Any old/invalid JWT will be cleared by the server
    api.userData = null;

    try {
        const text = await res.text();
        const obj = JSON.parse(text);
        console.log('unauthorized message: ' + text);

        const err = obj as ApiError;
        uiState.loginError = String(err.message);
    } catch (err) {
        uiState.loginError = String(err);
    }

    // Save current location url
    // store.urlBeforeLogin = window.location.href;
    // get current path

    if (isEmbedded()) {
        const path = window.location.pathname.removePrefix(getBasePath() ?? '');
        // get path you want to redirect to
        const targetPath = `/clusters/${appConfig.clusterId}/unauthorized`;
        // when is embedded redirect to the cloud-ui
        if (path !== targetPath) {
            window.location.replace(`/clusters/${appConfig.clusterId}/unauthorized`)
        }
    } else {
        // Redirect to login
        appGlobal.history.push('/login');
    }
}

function processVersionInfo(headers: Headers) {
    try {
        for (const [k, v] of headers) {
            if (k.toLowerCase() != 'app-build-timestamp')
                continue;

            const serverBuildTimestamp = Number(v);
            if (v != null && v != '' && Number.isFinite(serverBuildTimestamp)) {
                if (uiState.serverBuildTimestamp != serverBuildTimestamp)
                    uiState.serverBuildTimestamp = serverBuildTimestamp;
            }

            return;
        }
    } catch { } // Catch malformed json (old versions where info is not sent as json yet)
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

        this.isPending = true;
        this.error = null;
        this.promise = promise;

        promise.then(result => {
            this.timeSinceLastResult.reset();
            this.lastResult = result;
        }).catch(err => {
            this.lastResult = undefined;
            this.error = err;
        }).finally(() => {
            this.lastRequestDurationMs = this.timeSinceRequestStarted.value;
            const index = api.activeRequests.indexOf(this);
            if (index > -1) {
                api.activeRequests.splice(index, 1);
            }
            this.isPending = false;
        });

        api.activeRequests.push(this);
    }

    error: any | null = null;
    lastResult: any | undefined; // set automatically
    isPending: boolean; // set automatically

    private timeSinceRequestStarted = new TimeSince(); // set automatically
    private lastRequestDurationMs: number; // set automatically
    /** How long (in seconds) the last request took (or is currently taking so far) */
    get requestTime() {
        if (this.isPending) {
            return this.timeSinceRequestStarted.value / 1000;
        }
        return this.lastRequestDurationMs / 1000;
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
        // return already running request
        return entry.lastPromise;
    }

    if (entry.resultAge > REST_CACHE_DURATION_SEC || force) {
        // expired or force refresh
        const promise = rest<T>(url);
        entry.setPromise(promise);
    }

    // Return last result (can be still pending, or completed but not yet expired)
    return entry.lastPromise;
}


let messageSearchAbortController: AbortController | null = null;

//
// BackendAPI
//
const apiStore = {

    // Data
    endpointCompatibility: null as (EndpointCompatibility | null),
    licenses: null as (RedpandaLicense[] | null),
    news: null as OverviewNewsEntry[] | null,

    clusterOverview: null as ClusterOverview | null,
    brokers: null as BrokerWithConfigAndStorage[] | null,

    clusters: ['A', 'B', 'C'],
    clusterInfo: null as (ClusterInfo | null),

    brokerConfigs: new Map<number, ConfigEntry[] | string>(), // config entries, or error string

    adminInfo: undefined as (AdminInfo | undefined | null),

    schemaOverviewIsConfigured: undefined as boolean | undefined,

    schemaMode: undefined as string | null | undefined,  // undefined = not yet known, null = got not configured response
    schemaCompatibility: undefined as string | null | undefined, // undefined = not yet known, null = got not configured response
    schemaSubjects: undefined as SchemaRegistrySubject[] | undefined,
    schemaTypes: undefined as string[] | undefined,
    schemaDetails: new Map<string, SchemaRegistrySubjectDetails>(), // subjectName => details
    schemaReferencedBy: new Map<string, Map<number, SchemaReferencedByEntry[]>>(), // subjectName => version => details
    schemaUsagesById: new Map<number, SchemaVersion[]>(),

    topics: null as (Topic[] | null),
    topicConfig: new Map<string, TopicDescription | null>(), // null = not allowed to view config of this topic
    topicDocumentation: new Map<string, TopicDocumentation>(),
    topicPermissions: new Map<string, TopicPermissions | null>(),
    topicPartitions: new Map<string, Partition[] | null>(), // null = not allowed to view partitions of this config
    topicPartitionErrors: new Map<string, Array<{ id: number, partitionError: string; }>>(),
    topicWatermarksErrors: new Map<string, Array<{ id: number, waterMarksError: string; }>>(),
    topicConsumers: new Map<string, TopicConsumer[]>(),
    topicAcls: new Map<string, GetAclOverviewResponse | null>(),

    serviceAccounts: undefined as GetUsersResponse | undefined | null,
    ACLs: undefined as GetAclOverviewResponse | undefined | null,

    Quotas: undefined as QuotaResponse | undefined | null,

    consumerGroups: new Map<string, GroupDescription>(),
    consumerGroupAcls: new Map<string, GetAclOverviewResponse | null>(),

    partitionReassignments: undefined as (PartitionReassignments[] | null | undefined),

    connectConnectors: undefined as (KafkaConnectors | undefined),
    connectAdditionalClusterInfo: new Map<string, ClusterAdditionalInfo>(), // clusterName => additional info (plugins)

    // undefined = we haven't checked yet
    // null = call completed, and we're not logged in
    userData: undefined as (UserData | null | undefined),
    async logout() {
        await appConfig.fetch('./logout');
        this.userData = null;
    },
    async refreshUserData() {
        await appConfig.fetch('./api/users/me').then(async r => {
            if (r.ok) {
                api.userData = await r.json() as UserData;
            } else if (r.status == 401) { // unauthorized / not logged in
                api.userData = null;
            } else if (r.status == 404) {
                // not found: frontend is configured as business-version, but backend is non-business-version
                // -> create a local fake user for debugging
                uiState.isUsingDebugUserLogin = true;
                api.userData = {
                    canViewConsoleUsers: false,
                    canListAcls: true,
                    canListQuotas: true,
                    canPatchConfigs: true,
                    canReassignPartitions: true,
                    canCreateSchemas: true,
                    canDeleteSchemas: true,
                    canManageSchemaRegistry: true,
                    canViewSchemas: true,
                    seat: null as any,
                    user: { providerID: -1, providerName: 'debug provider', id: 'debug', internalIdentifier: 'debug', meta: { avatarUrl: '', email: '', name: 'local fake user for debugging' } }
                };
            }
        });
    },

    // Make currently running requests observable
    activeRequests: [] as CacheEntry[],

    // Fetch errors
    errors: [] as any[],

    messageSearchPhase: null as string | null,
    messagesFor: '', // for what topic?
    messages: observable([] as TopicMessage[], { deep: false }),
    messagesElapsedMs: null as null | number,
    messagesBytesConsumed: 0,
    messagesTotalConsumed: 0,


    async startMessageSearchNew(_searchRequest: MessageSearchRequest): Promise<void> {
        // https://connectrpc.com/docs/web/using-clients
        // https://github.com/connectrpc/connect-es
        // https://github.com/connectrpc/examples-es

        const searchRequest = {
            ..._searchRequest, ...(appConfig.jwt ? {
                enterprise: {
                    redpandaCloud: {
                        accessToken: appConfig.jwt
                    }
                }
            } : {})
        }

        this.messageSearchPhase = 'Connecting';
        this.messagesBytesConsumed = 0;
        this.messagesTotalConsumed = 0;
        this.messagesFor = searchRequest.topicName;
        this.messages.length = 0;
        this.messagesElapsedMs = null;

        // do it
        const abortController = messageSearchAbortController = new AbortController();
        const transport = createConnectTransport({
            baseUrl: window.location.origin,
        });

        const client = createPromiseClient(ConsoleService, transport);

        const req = new ListMessagesRequest();
        req.topic = searchRequest.topicName
        req.startOffset = BigInt(searchRequest.startOffset)
        req.partitionId = searchRequest.partitionId
        req.maxResults = searchRequest.maxResults
        req.filterInterpreterCode = searchRequest.filterInterpreterCode

        try {
            for await (const res of await client.listMessages(req, { signal: abortController.signal })) {
                if (abortController.signal.aborted)
                    break;

                switch (res.controlMessage.case) {
                    case 'phase':
                        console.log('phase: ' + res.controlMessage.value.phase)
                        this.messageSearchPhase = res.controlMessage.value.phase;
                        break;
                    case 'progress':
                        console.log('progress: ' + res.controlMessage.value.messagesConsumed)
                        this.messagesBytesConsumed = Number(res.controlMessage.value.bytesConsumed);
                        this.messagesTotalConsumed = Number(res.controlMessage.value.messagesConsumed);
                        break;
                    case 'done':
                        this.messagesElapsedMs = Number(res.controlMessage.value.elapsedMs);
                        this.messagesBytesConsumed = Number(res.controlMessage.value.bytesConsumed);
                        // this.MessageSearchCancelled = msg.isCancelled;
                        this.messageSearchPhase = 'Done';
                        this.messageSearchPhase = null;
                        break;
                    case 'error':
                        // error doesn't necessarily mean the whole request is done
                        console.info('ws backend error: ' + res.controlMessage.value.message);
                        toast({
                            title: 'Backend Error',
                            description: res.controlMessage.value.message,
                            status: 'error'
                        });

                        break;
                    case 'data':
                        // TODO I would guess we should replace the rest interface types and just utilize the generated Connect types
                        // this is my hacky way of attempting to get things working by converting the Connect types
                        // to the rest interface types that are hooked up to other things

                        const m = {} as TopicMessage;
                        m.partitionID = res.controlMessage.value.partitionId

                        m.compression = CompressionType.Unknown
                        switch (res.controlMessage.value.compression) {
                            case ProtoCompressionType.UNCOMPRESSED:
                                m.compression = CompressionType.Uncompressed;
                                break;
                            case ProtoCompressionType.GZIP:
                                m.compression = CompressionType.GZip;
                                break;
                            case ProtoCompressionType.SNAPPY:
                                m.compression = CompressionType.Snappy;
                                break;
                            case ProtoCompressionType.LZ4:
                                m.compression = CompressionType.LZ4;
                                break;
                            case ProtoCompressionType.ZSTD:
                                m.compression = CompressionType.ZStd;
                                break;
                        }

                        m.offset = Number(res.controlMessage.value.offset)
                        m.timestamp = Number(res.controlMessage.value.timestamp)
                        m.isTransactional = res.controlMessage.value.isTransactional
                        m.headers = [];
                        res.controlMessage.value.headers.forEach(h => {
                            m.headers.push({
                                key: h.key,
                                value: {
                                    payload: JSON.stringify(new TextDecoder().decode(h.value)),
                                    encoding: 'text',
                                    schemaId: 0,
                                    size: h.value.length,
                                    isPayloadNull: h.value == null,
                                }
                            })
                        })

                        // key
                        const key = res.controlMessage.value.key;
                        const keyPayload = new TextDecoder().decode(key?.normalizedPayload);

                        m.key = {} as Payload
                        switch (key?.encoding) {
                            case PayloadEncoding.NONE:
                                m.key.encoding = 'none';
                                break;
                            case PayloadEncoding.BINARY:
                                m.key.encoding = 'binary';
                                break;
                            case PayloadEncoding.XML:
                                m.key.encoding = 'xml';
                                break;
                            case PayloadEncoding.AVRO:
                                m.key.encoding = 'avro';
                                break;
                            case PayloadEncoding.JSON:
                                m.key.encoding = 'json';
                                break;
                            case PayloadEncoding.PROTOBUF:
                                m.key.encoding = 'protobuf';
                                break;
                            case PayloadEncoding.MESSAGE_PACK:
                                m.key.encoding = 'msgpack';
                                break;
                            case PayloadEncoding.TEXT:
                                m.key.encoding = 'text';
                                break;
                            case PayloadEncoding.UTF8:
                                m.key.encoding = 'utf8WithControlChars';
                                break;
                            case PayloadEncoding.UINT:
                                m.key.encoding = 'uint';
                                break;
                            case PayloadEncoding.SMILE:
                                m.key.encoding = 'smile';
                                break;
                            case PayloadEncoding.CONSUMER_OFFSETS:
                                m.key.encoding = 'consumerOffsets';
                                break;
                            default:
                                console.log('unhandled key encoding type', {
                                    encoding: key?.encoding,
                                    encodingName: key?.encoding != null ? proto3.getEnumType(PayloadEncoding).findNumber(key.encoding)?.localName : undefined,
                                    message: res,
                                })
                        }

                        m.key.isPayloadNull = key?.payloadSize == 0;
                        m.key.payload = keyPayload;

                        try {
                            m.key.payload = JSON.parse(keyPayload);
                        } catch { }

                        if (key?.encoding == PayloadEncoding.BINARY || key?.encoding == PayloadEncoding.UTF8) {
                            m.keyBinHexPreview = base64ToHexString(m.key.payload);
                            m.key.payload = decodeBase64(m.key.payload);
                        }

                        m.key.troubleshootReport = key?.troubleshootReport;
                        m.key.schemaId = key?.schemaId ?? 0;
                        m.keyJson = JSON.stringify(m.key.payload);
                        m.key.size = Number(key?.payloadSize);
                        m.key.isPayloadTooLarge = key?.isPayloadTooLarge;

                        // console.log(m.keyJson)

                        // value
                        const val = res.controlMessage.value.value;
                        const valuePayload = new TextDecoder().decode(val?.normalizedPayload);

                        m.value = {} as Payload;
                        m.value.payload = valuePayload;

                        switch (val?.encoding) {
                            case PayloadEncoding.NONE:
                                m.value.encoding = 'none';
                                break;
                            case PayloadEncoding.BINARY:
                                m.value.encoding = 'binary';
                                break;
                            case PayloadEncoding.XML:
                                m.value.encoding = 'xml';
                                break;
                            case PayloadEncoding.AVRO:
                                m.value.encoding = 'avro';
                                break;
                            case PayloadEncoding.JSON:
                                m.value.encoding = 'json';
                                break;
                            case PayloadEncoding.PROTOBUF:
                                m.value.encoding = 'protobuf';
                                break;
                            case PayloadEncoding.MESSAGE_PACK:
                                m.value.encoding = 'msgpack';
                                break;
                            case PayloadEncoding.TEXT:
                                m.value.encoding = 'text';
                                break;
                            case PayloadEncoding.UTF8:
                                m.value.encoding = 'utf8WithControlChars';
                                break;
                            case PayloadEncoding.UINT:
                                m.value.encoding = 'uint';
                                break;
                            case PayloadEncoding.SMILE:
                                m.value.encoding = 'smile';
                                break;
                            case PayloadEncoding.CONSUMER_OFFSETS:
                                m.value.encoding = 'consumerOffsets';
                                break;
                            default:
                                console.log('unhandled value encoding type', {
                                    encoding: val?.encoding,
                                    encodingName: val?.encoding != null ? proto3.getEnumType(PayloadEncoding).findNumber(val.encoding)?.localName : undefined,
                                    message: res,
                                })
                        }

                        m.value.schemaId = val?.schemaId ?? 0;
                        m.value.troubleshootReport = val?.troubleshootReport;
                        m.value.isPayloadNull = val?.payloadSize == 0;
                        m.valueJson = valuePayload;
                        m.value.isPayloadTooLarge = val?.isPayloadTooLarge;

                        try {
                            m.value.payload = JSON.parse(valuePayload);
                        } catch { }

                        if (val?.encoding == PayloadEncoding.BINARY) {
                            m.valueBinHexPreview = val ? uint8ArrayToHexString(val.normalizedPayload) : '';
                            m.value.payload = decodeBase64(m.value.payload);
                        }

                        m.valueJson = JSON.stringify(m.value.payload);
                        m.value.size = Number(val?.payloadSize);

                        this.messages.push(m);
                        break;
                }
            }
        } catch (e) {
            // https://connectrpc.com/docs/web/errors
            if (abortController.signal.aborted) {
                console.log('startMessageSearchNew: cooperatively aborted by user or automatic restart. abortController reason: ' + abortController.signal.reason);
                messageSearchAbortController = null;

            } else {
                console.error('startMessageSearchNew: error in await loop of client.listMessages', { error: e });
            }
        }

        // one done
        api.stopMessageSearch();
    },

    stopMessageSearch() {
        if (messageSearchAbortController) {
            messageSearchAbortController.abort('aborted by user');
            messageSearchAbortController = null;
        }

        if (this.messageSearchPhase != null) {
            this.messageSearchPhase = 'Done';
            this.messagesBytesConsumed = 0;
            this.messagesTotalConsumed = 0;
            this.messageSearchPhase = null;
        }
    },

    refreshTopics(force?: boolean) {
        cachedApiRequest<GetTopicsResponse>(`${appConfig.restBasePath}/topics`, force)
            .then(v => {
                if (v?.topics != null) {
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

                }
                this.topics = v?.topics;
            }, addError);
    },

    async refreshTopicConfig(topicName: string, force?: boolean): Promise<void> {
        const promise = cachedApiRequest<TopicConfigResponse | null>(`${appConfig.restBasePath}/topics/${encodeURIComponent(topicName)}/configuration`, force)
            .then(v => {
                if (!v) {
                    this.topicConfig.delete(topicName);
                    return;
                }

                if (v.topicDescription.error) {
                    this.topicConfig.set(topicName, v.topicDescription);
                    return;
                }

                // add 'type' to each synonym
                // in the raw data, only the root entries have 'type', but the nested synonyms do not
                // we need 'type' on synonyms as well for filtering
                const topicDescription = v.topicDescription;
                prepareSynonyms(topicDescription.configEntries);
                this.topicConfig.set(topicName, topicDescription);

            }, addError); // 403 -> null
        return promise as Promise<void>;
    },

    async getTopicOffsetsByTimestamp(topicNames: string[], timestampUnixMs: number): Promise<TopicOffset[]> {
        const query = `topicNames=${encodeURIComponent(topicNames.join(','))}&timestamp=${timestampUnixMs}`;
        const response = await appConfig.fetch(`${appConfig.restBasePath}/topics-offsets?${query}`, {
            method: 'GET',
            headers: [
                ['Content-Type', 'application/json']
            ]
        });

        const r = await parseOrUnwrap<GetTopicOffsetsByTimestampResponse>(response, null);
        return r.topicOffsets;
    },

    refreshTopicDocumentation(topicName: string, force?: boolean) {
        cachedApiRequest<TopicDocumentationResponse>(`${appConfig.restBasePath}/topics/${encodeURIComponent(topicName)}/documentation`, force)
            .then(v => {
                const text = v.documentation.markdown == null ? null : decodeBase64(v.documentation.markdown);
                v.documentation.text = text;
                this.topicDocumentation.set(topicName, v.documentation);
            }, addError);
    },

    refreshTopicPermissions(topicName: string, force?: boolean) {
        if (!AppFeatures.SINGLE_SIGN_ON) return; // without SSO there can't be a permissions endpoint
        if (this.userData?.user?.providerID == -1) return; // debug user
        cachedApiRequest<TopicPermissions | null>(`${appConfig.restBasePath}/permissions/topics/${encodeURIComponent(topicName)}`, force)
            .then(x => this.topicPermissions.set(topicName, x), addError);
    },

    async deleteTopic(topicName: string) {
        return rest(`${appConfig.restBasePath}/topics/${encodeURIComponent(topicName)}`, { method: 'DELETE' }).catch(addError);
    },

    async deleteTopicRecords(topicName: string, offset: number, partitionId?: number) {
        const partitions = (partitionId != undefined) ? [{ partitionId, offset }] : this.topicPartitions?.get(topicName)?.map(partition => ({ partitionId: partition.id, offset }));

        if (!partitions || partitions.length === 0) {
            addError(new Error(`Topic ${topicName} doesn't have partitions.`));
            return;
        }

        return this.deleteTopicRecordsFromMultiplePartitionOffsetPairs(topicName, partitions);
    },

    async deleteTopicRecordsFromAllPartitionsHighWatermark(topicName: string) {
        const partitions = this.topicPartitions?.get(topicName)?.map(({ waterMarkHigh, id }) => ({
            partitionId: id,
            offset: waterMarkHigh
        }));

        if (!partitions || partitions.length === 0) {
            addError(new Error(`Topic ${topicName} doesn't have partitions.`));
            return;
        }

        return this.deleteTopicRecordsFromMultiplePartitionOffsetPairs(topicName, partitions);
    },

    async deleteTopicRecordsFromMultiplePartitionOffsetPairs(topicName: string, pairs: Array<{ partitionId: number, offset: number; }>) {
        return rest<DeleteRecordsResponseData>(`${appConfig.restBasePath}/topics/${encodeURIComponent(topicName)}/records`, {
            method: 'DELETE',
            headers: [
                ['Content-Type', 'application/json']
            ],
            body: JSON.stringify({ partitions: pairs })
        }).catch(addError);
    },

    refreshPartitions(topics: 'all' | string[] = 'all', force?: boolean): Promise<void> {
        if (Array.isArray(topics))
            // sort in order to maximize cache hits (todo: track/cache each topic individually instead)
            topics = topics.sort().map(t => encodeURIComponent(t));

        const url = topics == 'all'
            ? `${appConfig.restBasePath}/operations/topic-details`
            : `${appConfig.restBasePath}/operations/topic-details?topicNames=${topics.joinStr(',')}`;

        return cachedApiRequest<GetAllPartitionsResponse | null>(url, force)
            .then(response => {
                if (!response?.topics) return;
                transaction(() => {

                    const errors: {
                        topicName: string,
                        partitionErrors: { partitionId: number, error: string; }[],
                        waterMarkErrors: { partitionId: number, error: string; }[],
                    }[] = [];

                    for (const t of response.topics) {
                        if (t.error != null) {
                            // console.error(`refreshAllTopicPartitions: error for topic ${t.topicName}: ${t.error}`);
                            continue;
                        }

                        // If any partition has any errors, don't set the result for that topic
                        const partitionErrors = [];
                        const waterMarkErrors = [];
                        for (const p of t.partitions) {
                            // topicName
                            p.topicName = t.topicName;

                            let partitionHasError = false;
                            if (p.partitionError) {
                                partitionErrors.push({ partitionId: p.id, error: p.partitionError });
                                partitionHasError = true;
                            } if (p.waterMarksError) {
                                waterMarkErrors.push({ partitionId: p.id, error: p.waterMarksError });
                                partitionHasError = true;
                            }
                            if (partitionHasError) {
                                p.hasErrors = true;
                                continue;
                            }

                            // Add some local/cached properties to make working with the data easier
                            const validLogDirs = p.partitionLogDirs.filter(e => !e.error && e.size >= 0);
                            const replicaSize = validLogDirs.length > 0 ? validLogDirs.max(e => e.size) : 0;
                            p.replicaSize = replicaSize >= 0 ? replicaSize : 0;
                        }

                        // Set partition
                        this.topicPartitions.set(t.topicName, t.partitions);

                        if (partitionErrors.length == 0 && waterMarkErrors.length == 0) {

                        } else {
                            errors.push({
                                topicName: t.topicName,
                                partitionErrors: partitionErrors,
                                waterMarkErrors: waterMarkErrors,
                            });
                        }
                    }

                    // if (errors.length > 0)
                    //     console.error('refreshAllTopicPartitions: response had errors', errors);
                });
            }, addError);
    },

    refreshPartitionsForTopic(topicName: string, force?: boolean) {
        cachedApiRequest<GetPartitionsResponse | null>(`${appConfig.restBasePath}/topics/${encodeURIComponent(topicName)}/partitions`, force)
            .then(response => {
                if (response?.partitions) {
                    const partitionErrors: Array<{ id: number, partitionError: string; }> = [], waterMarksErrors: Array<{ id: number, waterMarksError: string; }> = [];


                    // Add some local/cached properties to make working with the data easier
                    for (const p of response.partitions) {
                        // topicName
                        p.topicName = topicName;

                        if (p.partitionError) partitionErrors.push({ id: p.id, partitionError: p.partitionError });
                        if (p.waterMarksError) waterMarksErrors.push({ id: p.id, waterMarksError: p.waterMarksError });
                        if (partitionErrors.length || waterMarksErrors.length) continue;

                        // replicaSize
                        const validLogDirs = p.partitionLogDirs.filter(e => (e.error == null || e.error == '') && e.size >= 0);
                        const replicaSize = validLogDirs.length > 0 ? validLogDirs.max(e => e.size) : 0;
                        p.replicaSize = replicaSize >= 0 ? replicaSize : 0;
                    }

                    if (partitionErrors.length == 0 && waterMarksErrors.length == 0) {
                        // Set partitions
                        this.topicPartitionErrors.delete(topicName);
                        this.topicWatermarksErrors.delete(topicName);
                        this.topicPartitions.set(topicName, response.partitions);
                    } else {
                        this.topicPartitionErrors.set(topicName, partitionErrors);
                        this.topicWatermarksErrors.set(topicName, waterMarksErrors);
                        console.error(`refreshPartitionsForTopic: response has partition errors (t=${topicName} p=${partitionErrors.length}, w=${waterMarksErrors.length})`);
                    }

                } else {
                    // Set null to indicate that we're not allowed to see the partitions
                    this.topicPartitions.set(topicName, null);
                    return;
                }

                let partitionErrors = 0, waterMarkErrors = 0;

                // Add some local/cached properties to make working with the data easier
                for (const p of response.partitions) {
                    // topicName
                    p.topicName = topicName;

                    if (p.partitionError) partitionErrors++;
                    if (p.waterMarksError) waterMarkErrors++;
                    if (partitionErrors || waterMarkErrors) {
                        p.hasErrors = true;
                        continue;
                    }

                    // replicaSize
                    const validLogDirs = p.partitionLogDirs.filter(e => (e.error == null || e.error == '') && e.size >= 0);
                    const replicaSize = validLogDirs.length > 0 ? validLogDirs.max(e => e.size) : 0;
                    p.replicaSize = replicaSize >= 0 ? replicaSize : 0;
                }

                // Set partitions
                this.topicPartitions.set(topicName, response.partitions);

                if (partitionErrors > 0 || waterMarkErrors > 0)
                    console.warn(`refreshPartitionsForTopic: response has partition errors (topic=${topicName} partitionErrors=${partitionErrors}, waterMarkErrors=${waterMarkErrors})`);
            }, addError);
    },

    refreshTopicAcls(topicName: string, force?: boolean) {
        const query = aclRequestToQuery({ ...AclRequestDefault, resourcePatternTypeFilter: 'Match', resourceType: 'Topic', resourceName: topicName });
        cachedApiRequest<GetAclOverviewResponse | null>(`${appConfig.restBasePath}/acls?${query}`, force)
            .then(v => {
                if (v)
                    normalizeAcls(v.aclResources);
                this.topicAcls.set(topicName, v);
            });
    },

    refreshTopicConsumers(topicName: string, force?: boolean) {
        cachedApiRequest<GetTopicConsumersResponse>(`${appConfig.restBasePath}/topics/${encodeURIComponent(topicName)}/consumers`, force)
            .then(v => this.topicConsumers.set(topicName, v.topicConsumers), addError);
    },

    async refreshAcls(request: GetAclsRequest, force?: boolean): Promise<void> {
        const query = aclRequestToQuery(request);
        await cachedApiRequest<GetAclOverviewResponse | null>(`${appConfig.restBasePath}/acls?${query}`, force)
            .then(v => {
                if (v) {
                    normalizeAcls(v.aclResources);
                    this.ACLs = v;
                }
                else {
                    this.ACLs = null;
                }
            }, addError);
    },

    refreshQuotas(force?: boolean) {
        cachedApiRequest<QuotaResponse | null>(`${appConfig.restBasePath}/quotas`, force)
            .then(v => this.Quotas = v ?? null, addError);
    },

    async refreshSupportedEndpoints(): Promise<EndpointCompatibilityResponse | null> {
        const r = await rest<EndpointCompatibilityResponse>(`${appConfig.restBasePath}/console/endpoints`);
        if (!r)
            return null;
        this.endpointCompatibility = r.endpointCompatibility;
        this.licenses = r.licenses;
        return r;
    },

    refreshClusterOverview(force?: boolean) {
        cachedApiRequest<ClusterOverview>(`${appConfig.restBasePath}/cluster/overview`, force)
            .then(v => {
                this.clusterOverview = v;
            }, addError);
    },

    get isRedpanda() {
        const overview = this.clusterOverview;
        if (!overview)
            return false;
        if (overview.kafka.distribution == 'REDPANDA')
            return true;

        return false;
    },

    refreshBrokers(force?: boolean) {
        cachedApiRequest<BrokerWithConfigAndStorage[]>(`${appConfig.restBasePath}/brokers`, force)
            .then(v => {
                this.brokers = v;
            }, addError);
    },

    refreshNews(force?: boolean) {
        cachedApiRequest<OverviewNewsEntry[]>('https://resources.redpanda.com/rp-console.json', force)
            .then(v => this.news = v, err => {
                this.news = [
                    {
                        title: 'Unable to fetch news, please try again later',
                        intendedAudience: 'all',
                    }
                ];

                console.error('Unable to fetch news entries, please try again later', { error: err })
            });
    },


    refreshCluster(force?: boolean) {
        cachedApiRequest<ClusterInfoResponse>(`${appConfig.restBasePath}/cluster`, force)
            .then(v => {
                if (v?.clusterInfo != null) {
                    transaction(() => {
                        // add 'type' to each synonym entry
                        for (const broker of v.clusterInfo.brokers)
                            if (broker.config && !broker.config.error)
                                prepareSynonyms(broker.config.configs);

                        // don't assign if the value didn't change
                        // we'd re-trigger all observers!
                        // TODO: it would probably be easier to just annotate 'clusterInfo' with a structural comparer
                        if (!comparer.structural(this.clusterInfo, v.clusterInfo))
                            this.clusterInfo = v.clusterInfo;

                        for (const b of v.clusterInfo.brokers)
                            if (b.config.error)
                                this.brokerConfigs.set(b.brokerId, b.config.error);
                            else
                                this.brokerConfigs.set(b.brokerId, b.config.configs);
                    });
                }
            }, addError);
    },

    refreshBrokerConfig(brokerId: number, force?: boolean) {
        cachedApiRequest<BrokerConfigResponse>(`${appConfig.restBasePath}/brokers/${brokerId}/config`, force)
            .then(v => {
                prepareSynonyms(v.brokerConfigs);
                this.brokerConfigs.set(brokerId, v.brokerConfigs);
            })
            .catch(err => {
                this.brokerConfigs.set(brokerId, String(err));
            });
    },

    refreshConsumerGroup(groupId: string, force?: boolean) {
        cachedApiRequest<GetConsumerGroupResponse>(`${appConfig.restBasePath}/consumer-groups/${encodeURIComponent(groupId)}`, force)
            .then(v => {
                addFrontendFieldsForConsumerGroup(v.consumerGroup);
                this.consumerGroups.set(v.consumerGroup.groupId, v.consumerGroup);
            }, addError);
    },

    refreshConsumerGroups(force?: boolean) {
        cachedApiRequest<GetConsumerGroupsResponse>(`${appConfig.restBasePath}/consumer-groups`, force)
            .then(v => {
                if (v?.consumerGroups != null) {
                    for (const g of v.consumerGroups)
                        addFrontendFieldsForConsumerGroup(g);

                    transaction(() => {
                        this.consumerGroups.clear();
                        for (const g of v.consumerGroups)
                            this.consumerGroups.set(g.groupId, g);
                    });
                }
            }, addError);
    },

    refreshConsumerGroupAcls(groupName: string, force?: boolean) {
        const query = aclRequestToQuery({ ...AclRequestDefault, resourcePatternTypeFilter: 'Match', resourceType: 'Group', resourceName: groupName });
        cachedApiRequest<GetAclOverviewResponse | null>(`${appConfig.restBasePath}/acls?${query}`, force)
            .then(v => {
                if (v) {
                    normalizeAcls(v.aclResources);
                }
                this.consumerGroupAcls.set(groupName, v);
            });
    },

    async editConsumerGroupOffsets(groupId: string, topics: EditConsumerGroupOffsetsTopic[]):
        Promise<EditConsumerGroupOffsetsResponseTopic[]> {
        const request: EditConsumerGroupOffsetsRequest = {
            groupId: groupId,
            topics: topics
        };

        const response = await appConfig.fetch(`${appConfig.restBasePath}/consumer-groups/${encodeURIComponent(groupId)}`, {
            method: 'PATCH',
            headers: [
                ['Content-Type', 'application/json']
            ],
            body: toJson(request),
        });

        const r = await parseOrUnwrap<EditConsumerGroupOffsetsResponse>(response, null);
        return r.topics;
    },

    async deleteConsumerGroupOffsets(groupId: string, topics: DeleteConsumerGroupOffsetsTopic[]):
        Promise<DeleteConsumerGroupOffsetsResponseTopic[]> {
        const request: DeleteConsumerGroupOffsetsRequest = {
            groupId: groupId,
            topics: topics
        };

        const response = await appConfig.fetch(`${appConfig.restBasePath}/consumer-groups/${encodeURIComponent(groupId)}/offsets`, {
            method: 'DELETE',
            headers: [
                ['Content-Type', 'application/json']
            ],
            body: toJson(request),
        });

        const r = await parseOrUnwrap<DeleteConsumerGroupOffsetsResponse>(response, null);
        return r.topics;
    },

    async deleteConsumerGroup(groupId: string): Promise<void> {
        const response = await appConfig.fetch(`${appConfig.restBasePath}/consumer-groups/${encodeURIComponent(groupId)}`, {
            method: 'DELETE',
            headers: [
                ['Content-Type', 'application/json']
            ]
        });

        await parseOrUnwrap<void>(response, null);
    },


    refreshAdminInfo(force?: boolean) {
        cachedApiRequest<AdminInfo | null>(`${appConfig.restBasePath}/admin`, force)
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
                    if (binding.resolvedRole == null) console.error('could not resolve roleBinding to role: ' + toJson(binding));
                }

                // resolve bindings, and roles of each user
                for (const user of info.users) {
                    user.bindings = user.bindingIds.map(id => info.roleBindings.first(rb => rb.ephemeralId == id)!);
                    if (user.bindings.any(b => b == null)) console.error('one or more rolebindings could not be resolved for user: ' + toJson(user));

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

    refreshSchemaMode(force?: boolean) {
        const rq = cachedApiRequest(`${appConfig.restBasePath}/schema-registry/mode`, force) as Promise<SchemaRegistryModeResponse>;
        return rq
            .then(r => {
                if (r.isConfigured == false) {
                    this.schemaOverviewIsConfigured = false;
                    this.schemaMode = null;
                } else {
                    this.schemaOverviewIsConfigured = true;
                    this.schemaMode = r.mode;
                }
            })
            .catch(addError);
    },

    refreshSchemaCompatibilityConfig(force?: boolean) {
        const rq = cachedApiRequest(`${appConfig.restBasePath}/schema-registry/config`, force) as Promise<SchemaRegistryConfigResponse>;
        return rq
            .then(r => {
                if (r.isConfigured == false) {
                    this.schemaOverviewIsConfigured = false;
                    this.schemaCompatibility = null;
                } else {
                    this.schemaOverviewIsConfigured = true;
                    this.schemaCompatibility = r.compatibility;
                }
            })
            .catch(addError);
    },

    refreshSchemaSubjects(force?: boolean) {
        cachedApiRequest<SchemaRegistrySubject[]>(`${appConfig.restBasePath}/schema-registry/subjects`, force)
            .then(subjects => {
                // could also be a "not configured" response
                if (Array.isArray(subjects)) {
                    this.schemaSubjects = subjects;
                }
            }, addError);
    },

    refreshSchemaTypes(force?: boolean) {
        cachedApiRequest<SchemaRegistrySchemaTypesResponse>(`${appConfig.restBasePath}/schema-registry/schemas/types`, force)
            .then(types => {
                // could also be a "not configured" response
                if (types.schemaTypes) {
                    this.schemaTypes = types.schemaTypes;
                }
            }, addError);
    },

    refreshSchemaDetails(subjectName: string, force?: boolean) {
        // Always refresh all versions, otherwise we cannot know wether or not we have to refresh with 'all,
        // If we refresh with 'latest' or specific number, we'd need to keep track of what information we're missing
        const version = 'all';
        const rq = cachedApiRequest(`${appConfig.restBasePath}/schema-registry/subjects/${encodeURIComponent(subjectName)}/versions/${version}`, force) as Promise<SchemaRegistrySubjectDetails>;

        return rq
            .then(details => {
                this.schemaDetails.set(subjectName, details);
            })
            .catch(addError);
    },

    refreshSchemaReferencedBy(subjectName: string, version: number, force?: boolean) {

        const rq = cachedApiRequest<SchemaReferencedByEntry[]>(`${appConfig.restBasePath}/schema-registry/subjects/${encodeURIComponent(subjectName)}/versions/${version}/referencedby`, force);

        return rq.then(references => {

            const cleanedReferences = [] as SchemaReferencedByEntry[];
            for (const ref of references) {
                if (ref.error) {
                    console.error('error in refreshSchemaReferencedBy, reference entry has error', { subjectName, version, error: ref.error, refRaw: ref });
                    continue;
                }
                cleanedReferences.push(ref);
            }


            let subjectVersions = this.schemaReferencedBy.get(subjectName);
            if (!subjectVersions) {
                subjectVersions = observable(new Map<number, SchemaReferencedByEntry[]>());
                this.schemaReferencedBy.set(subjectName, subjectVersions);
            }

            subjectVersions.set(version, cleanedReferences);
        }).catch(() => { });
    },

    refreshSchemaUsagesById(schemaId: number, force?: boolean) {
        cachedApiRequest<SchemaVersion[]>(`${appConfig.restBasePath}/schema-registry/schemas/ids/${schemaId}/versions`, force)
            .then(r => {
                this.schemaUsagesById.set(schemaId, r);
            }, addError);
    },

    async setSchemaRegistryCompatibilityMode(mode: SchemaRegistryCompatibilityMode): Promise<SchemaRegistryConfigResponse> {
        const response = await appConfig.fetch(`${appConfig.restBasePath}/schema-registry/config`, {
            method: 'PUT',
            headers: [
                ['Content-Type', 'application/json']
            ],
            body: JSON.stringify({ compatibility: mode } as SchemaRegistrySetCompatibilityModeRequest),
        });
        return parseOrUnwrap<SchemaRegistryConfigResponse>(response, null);
    },

    async setSchemaRegistrySubjectCompatibilityMode(subjectName: string, mode: 'DEFAULT' | SchemaRegistryCompatibilityMode): Promise<SchemaRegistryConfigResponse> {
        if (mode === 'DEFAULT') {
            const response = await appConfig.fetch(`${appConfig.restBasePath}/schema-registry/config/${encodeURIComponent(subjectName)}`, {
                method: 'DELETE',
            });
            return parseOrUnwrap<SchemaRegistryConfigResponse>(response, null);
        }
        else {
            const response = await appConfig.fetch(`${appConfig.restBasePath}/schema-registry/config/${encodeURIComponent(subjectName)}`, {
                method: 'PUT',
                headers: [
                    ['Content-Type', 'application/json']
                ],
                body: JSON.stringify({ compatibility: mode } as SchemaRegistrySetCompatibilityModeRequest),
            });
            return parseOrUnwrap<SchemaRegistryConfigResponse>(response, null);
        }
    },

    async validateSchema(subjectName: string, version: number | 'latest', request: SchemaRegistryCreateSchema): Promise<SchemaRegistryValidateSchemaResponse> {
        const response = await appConfig.fetch(`${appConfig.restBasePath}/schema-registry/subjects/${encodeURIComponent(subjectName)}/versions/${version}/validate`, {
            method: 'POST',
            headers: [
                ['Content-Type', 'application/json']
            ],
            body: JSON.stringify(request),
        });
        return parseOrUnwrap<SchemaRegistryValidateSchemaResponse>(response, null);
    },
    async createSchema(subjectName: string, request: SchemaRegistryCreateSchema): Promise<SchemaRegistryCreateSchemaResponse> {
        const response = await appConfig.fetch(`${appConfig.restBasePath}/schema-registry/subjects/${encodeURIComponent(subjectName)}/versions`, {
            method: 'POST',
            headers: [
                ['Content-Type', 'application/json']
            ],
            body: JSON.stringify(request),
        });
        return parseOrUnwrap<SchemaRegistryCreateSchemaResponse>(response, null);
    },

    async deleteSchemaSubject(subjectName: string, permanent: boolean): Promise<SchemaRegistryDeleteSubjectResponse> {
        const response = await appConfig.fetch(`${appConfig.restBasePath}/schema-registry/subjects/${encodeURIComponent(subjectName)}?permanent=${permanent ? 'true' : 'false'}`, {
            method: 'DELETE',
            headers: [
                ['Content-Type', 'application/json']
            ]
        });
        return parseOrUnwrap<SchemaRegistryDeleteSubjectResponse>(response, null);
    },

    async deleteSchemaSubjectVersion(subjectName: string, version: 'latest' | number, permanent: boolean): Promise<SchemaRegistryDeleteSubjectVersionResponse> {
        const response = await appConfig.fetch(`${appConfig.restBasePath}/schema-registry/subjects/${encodeURIComponent(subjectName)}/versions/${encodeURIComponent(version)}?permanent=${permanent ? 'true' : 'false'}`, {
            method: 'DELETE',
            headers: [
                ['Content-Type', 'application/json']
            ]
        });
        return parseOrUnwrap<SchemaRegistryDeleteSubjectVersionResponse>(response, null);
    },

    refreshPartitionReassignments(force?: boolean): Promise<void> {
        return cachedApiRequest<PartitionReassignmentsResponse | null>(`${appConfig.restBasePath}/operations/reassign-partitions`, force)
            .then(v => {
                if (v === null)
                    this.partitionReassignments = null;
                else
                    this.partitionReassignments = v.topics;
            }, addError);
    },

    async startPartitionReassignment(request: PartitionReassignmentRequest): Promise<AlterPartitionReassignmentsResponse> {
        const response = await appConfig.fetch(`${appConfig.restBasePath}/operations/reassign-partitions`, {
            method: 'PATCH',
            headers: [
                ['Content-Type', 'application/json']
            ],
            body: toJson(request),
        });
        return await parseOrUnwrap<AlterPartitionReassignmentsResponse>(response, null);
    },

    async setReplicationThrottleRate(brokerIds: number[], maxBytesPerSecond: number): Promise<PatchConfigsResponse> {

        maxBytesPerSecond = Math.ceil(maxBytesPerSecond);

        const configRequest: PatchConfigsRequest = { resources: [] };

        for (const b of brokerIds) {
            configRequest.resources.push({
                resourceType: ConfigResourceType.Broker,
                resourceName: String(b),
                configs: [
                    { name: 'leader.replication.throttled.rate', op: AlterConfigOperation.Set, value: String(maxBytesPerSecond) },
                    { name: 'follower.replication.throttled.rate', op: AlterConfigOperation.Set, value: String(maxBytesPerSecond) },
                ]
            });
        }

        return await this.changeConfig(configRequest);
    },

    async setThrottledReplicas(
        topicReplicas: {
            topicName: string,
            leaderReplicas: { brokerId: number, partitionId: number; }[],
            followerReplicas: { brokerId: number, partitionId: number; }[];
        }[]): Promise<PatchConfigsResponse> {

        const configRequest: PatchConfigsRequest = { resources: [] };

        for (const t of topicReplicas) {
            const res: ResourceConfig = { // Set which topics to throttle
                resourceType: ConfigResourceType.Topic,
                resourceName: t.topicName,
                configs: [],
            };

            const leaderReplicas = t.leaderReplicas.map(e => `${e.partitionId}:${e.brokerId}`).join(',');
            res.configs.push({ name: 'leader.replication.throttled.replicas', op: AlterConfigOperation.Set, value: leaderReplicas });
            const followerReplicas = t.followerReplicas.map(e => `${e.partitionId}:${e.brokerId}`).join(',');
            res.configs.push({ name: 'follower.replication.throttled.replicas', op: AlterConfigOperation.Set, value: followerReplicas });

            // individual request for each topic
            configRequest.resources.push(res);
        }

        return await this.changeConfig(configRequest);
    },

    async resetThrottledReplicas(topicNames: string[]): Promise<PatchConfigsResponse> {

        const configRequest: PatchConfigsRequest = { resources: [] };

        // reset throttled replicas for those topics
        for (const t of topicNames) {
            configRequest.resources.push({
                resourceType: ConfigResourceType.Topic,
                resourceName: t,
                configs: [
                    { name: 'leader.replication.throttled.replicas', op: AlterConfigOperation.Delete },
                    { name: 'follower.replication.throttled.replicas', op: AlterConfigOperation.Delete }
                ],
            });
        }

        return await this.changeConfig(configRequest);
    },

    async resetReplicationThrottleRate(brokerIds: number[]): Promise<PatchConfigsResponse> {

        const configRequest: PatchConfigsRequest = { resources: [] };

        // We currently only set replication throttle on each broker, instead of cluster-wide (same effect, but different kind of 'ConfigSource')
        // So we don't remove the cluster-wide setting, only the ones we've set (the per-broker) settings

        // remove throttle configs from all brokers (DYNAMIC_DEFAULT_BROKER_CONFIG)
        // configRequest.resources.push({
        //     resourceType: ConfigResourceType.Broker,
        //     resourceName: "", // empty = all brokers
        //     configs: [
        //         { name: 'leader.replication.throttled.rate', op: AlterConfigOperation.Delete },
        //         { name: 'follower.replication.throttled.rate', op: AlterConfigOperation.Delete },
        //     ]
        // });

        // remove throttle configs from each broker individually (DYNAMIC_BROKER_CONFIG)
        for (const b of brokerIds) {
            configRequest.resources.push({
                resourceType: ConfigResourceType.Broker,
                resourceName: String(b),
                configs: [
                    { name: 'leader.replication.throttled.rate', op: AlterConfigOperation.Delete },
                    { name: 'follower.replication.throttled.rate', op: AlterConfigOperation.Delete },
                ]
            });
        }

        return await this.changeConfig(configRequest);
    },

    async changeConfig(request: PatchConfigsRequest): Promise<PatchConfigsResponse> {
        const response = await appConfig.fetch(`${appConfig.restBasePath}/operations/configs`, {
            method: 'PATCH',
            headers: [
                ['Content-Type', 'application/json']
            ],
            body: toJson(request),
        });
        return await parseOrUnwrap<PatchConfigsResponse>(response, null);
    },


    async refreshConnectClusters(force?: boolean): Promise<void> {
        return cachedApiRequest<KafkaConnectors | null>(`${appConfig.restBasePath}/kafka-connect/connectors`, force)
            .then(v => {
                // backend error
                if (!v) {
                    this.connectConnectors = undefined;
                    return;
                }

                // not configured
                if (!v.clusters) {
                    this.connectConnectors = v;
                    return;
                }

                // prepare helper properties
                for (const cluster of v.clusters)
                    addFrontendFieldsForConnectCluster(cluster);

                this.connectConnectors = v;
            }, addError);
    },

    // PATCH /topics/{topicName}/configuration   //
    // PATCH /topics/configuration               // default config
    async changeTopicConfig(topicName: string | null, configs: PatchTopicConfigsRequest['configs']): Promise<void> {
        const url = topicName
            ? `${appConfig.restBasePath}/topics/${encodeURIComponent(topicName)}/configuration`
            : `${appConfig.restBasePath}/topics/configuration`;

        const response = await appConfig.fetch(url, {
            method: 'PATCH',
            headers: [
                ['Content-Type', 'application/json']
            ],
            body: toJson({ configs }),
        });
        await parseOrUnwrap<void>(response, null);
    },

    // AdditionalInfo = list of plugins
    refreshClusterAdditionalInfo(clusterName: string, force?: boolean): Promise<void> {
        return cachedApiRequest<ClusterAdditionalInfo | null>(`${appConfig.restBasePath}/kafka-connect/clusters/${encodeURIComponent(clusterName)}`, force)
            .then(v => {
                if (!v) {
                    this.connectAdditionalClusterInfo.delete(clusterName);
                }
                else {
                    this.connectAdditionalClusterInfo.set(clusterName, v);
                }
            }, addError);
    },

    /*
    Commented out for now!
    There are some issues with refreshing a single connector:
        - We might not have the cluster/connector cached (can happen when a user visits the details page directly)
        - Updating the inner details (e.g. running tasks) won't update the cached total/running tasks in the cluster object
          which might make things pretty confusing for a user (pausing a connector, then going back to the overview page).
          One solution would be to update all clusters/connectors, which defeats the purpose of refreshing only one.
          The real solution would be to not have pre-computed fields.


    // Details for one connector
    async refreshConnectorDetails(clusterName: string, connectorName: string, force?: boolean): Promise<void> {

        const existingCluster = this.connectConnectors?.clusters?.find(x => x.clusterName == clusterName);
        if (!existingCluster)
            // if we don't have any info yet, or we don't know about that cluster, we need a full refresh
            return this.refreshConnectClusters(force);

        return cachedApiRequest<ClusterConnectorInfo | null>(`${appConfig.restBasePath}/kafka-connect/clusters/${clusterName}/connectors/${connectorName}`, force)
            .then(v => {
                if (!v) return; // backend error

                const cluster = this.connectConnectors?.clusters?.find(x => x.clusterName == clusterName);
                if (!cluster) return; // did we forget about the cluster somehow?

                const connector = cluster.connectors.

                // update given clusters
                runInAction(() => {
                    const clusters = this.connectConnectors?.clusters;
                    if (!v.clusters) return; // shouldn't happen: this method shouldn't get called if we don't already have info cached
                    if (!clusters) return; // shouldn't happen: if we don't have clusters locally we'd have refreshed them

                    for (const updatedCluster of v.clusters) {
                        addFrontendFieldsForConnectCluster(updatedCluster);

                        const index = clusters.findIndex(x => x.clusterName == updatedCluster.clusterName);
                        if (index < 0) {
                            // shouldn't happen, if we don't know the cluster, then how would we have requested new info for it?
                            clusters.push(updatedCluster);
                        } else {
                            // overwrite existing cluster with new data
                            clusters[index] = updatedCluster;
                        }
                    }
                });

            }, addError);
    },
*/
    /*
        // All, or for specific cluster
        refreshConnectors(clusterName?: string, force?: boolean): Promise<void> {
            const url = clusterName == null
                ? './api/kafka-connect/connectors'
                : `${appConfig.restBasePath}/kafka-connect/clusters/${clusterName}/connectors`;
            return cachedApiRequest<KafkaConnectors | null>(url, force)
                .then(v => {
                    if (v == null) {

                    }
                }, addError);
        },



    */

    async deleteConnector(clusterName: string, connector: string): Promise<void> {
        // DELETE "/kafka-connect/clusters/{clusterName}/connectors/{connector}"
        const response = await appConfig.fetch(`${appConfig.restBasePath}/kafka-connect/clusters/${encodeURIComponent(clusterName)}/connectors/${encodeURIComponent(connector)}`, {
            method: 'DELETE',
            headers: [
                ['Content-Type', 'application/json']
            ]
        });
        return parseOrUnwrap<void>(response, null);
    },

    async pauseConnector(clusterName: string, connector: string): Promise<void> {
        // PUT  "/kafka-connect/clusters/{clusterName}/connectors/{connector}/pause"  (idempotent)
        const response = await appConfig.fetch(`${appConfig.restBasePath}/kafka-connect/clusters/${encodeURIComponent(clusterName)}/connectors/${encodeURIComponent(connector)}/pause`, {
            method: 'PUT',
            headers: [
                ['Content-Type', 'application/json']
            ]
        });
        return parseOrUnwrap<void>(response, null);
    },

    async resumeConnector(clusterName: string, connector: string): Promise<void> {
        // PUT  "/kafka-connect/clusters/{clusterName}/connectors/{connector}/resume" (idempotent)
        const response = await appConfig.fetch(`${appConfig.restBasePath}/kafka-connect/clusters/${encodeURIComponent(clusterName)}/connectors/${encodeURIComponent(connector)}/resume`, {
            method: 'PUT',
            headers: [
                ['Content-Type', 'application/json']
            ]
        });
        return parseOrUnwrap<void>(response, null);
    },

    async restartConnector(clusterName: string, connector: string): Promise<void> {
        // POST "/kafka-connect/clusters/{clusterName}/connectors/{connector}/restart"
        const response = await appConfig.fetch(`${appConfig.restBasePath}/kafka-connect/clusters/${encodeURIComponent(clusterName)}/connectors/${encodeURIComponent(connector)}/restart`, {
            method: 'POST',
            headers: [
                ['Content-Type', 'application/json']
            ]
        });
        return parseOrUnwrap<void>(response, null);
    },

    async updateConnector(clusterName: string, connector: string, config: object): Promise<void> {
        // PUT "/kafka-connect/clusters/{clusterName}/connectors/{connector}"
        const response = await appConfig.fetch(`${appConfig.restBasePath}/kafka-connect/clusters/${encodeURIComponent(clusterName)}/connectors/${encodeURIComponent(connector)}`, {
            method: 'PUT',
            headers: [
                ['Content-Type', 'application/json']
            ],
            body: JSON.stringify({ config: config }),
        });
        return parseOrUnwrap<void>(response, null);
    },

    async restartTask(clusterName: string, connector: string, taskID: number): Promise<void> {
        // POST "/kafka-connect/clusters/{clusterName}/connectors/{connector}/tasks/{taskID}/restart"
        const response = await appConfig.fetch(`${appConfig.restBasePath}/kafka-connect/clusters/${encodeURIComponent(clusterName)}/connectors/${encodeURIComponent(connector)}/tasks/${String(taskID)}/restart`, {
            method: 'POST',
            headers: [
                ['Content-Type', 'application/json']
            ]
        });

        return parseOrUnwrap<void>(response, null);
    },

    async validateConnectorConfig(clusterName: string, pluginClassName: string, config: object): Promise<ConnectorValidationResult> {
        // PUT "/kafka-connect/clusters/{clusterName}/connector-plugins/{pluginClassName}/config/validate"
        const response = await appConfig.fetch(`${appConfig.restBasePath}/kafka-connect/clusters/${encodeURIComponent(clusterName)}/connector-plugins/${encodeURIComponent(pluginClassName)}/config/validate`, {
            method: 'PUT',
            headers: [
                ['Content-Type', 'application/json']
            ],
            body: JSON.stringify(config),
        });
        const result = await parseOrUnwrap<ConnectorValidationResult>(response, null);

        for (let i = 0; i < result.steps.length; i++) {
            result.steps[i].stepIndex = i;
        }

        return result;
    },

    async createConnector(clusterName: string, connectorName: string, pluginClassName: string, config: object): Promise<void> {
        // POST "/kafka-connect/clusters/{clusterName}/connectors"
        const response = await appConfig.fetch(`${appConfig.restBasePath}/kafka-connect/clusters/${encodeURIComponent(clusterName)}/connectors`, {
            method: 'POST',
            headers: [
                ['Content-Type', 'application/json']
            ],
            body: JSON.stringify({
                connectorName: connectorName,
                config: config
            }),
        });
        return parseOrUnwrap<void>(response, null);
    },

    async publishRecords(request: PublishRecordsRequest): Promise<ProduceRecordsResponse> {
        // POST "/topics-records"
        const response = await appConfig.fetch(`${appConfig.restBasePath}/topics-records`, {
            method: 'POST',
            headers: [
                ['Content-Type', 'application/json']
            ],
            body: JSON.stringify(request),
        });
        return parseOrUnwrap<ProduceRecordsResponse>(response, null);
    },

    // New version of "publishRecords"
    async publishMessage(request: PublishMessageRequest): Promise<PublishMessageResponse> {
        const transport = createConnectTransport({
            baseUrl: window.location.origin,
        });
        const client = createPromiseClient(ConsoleService, transport);
        const r = await client.publishMessage(request);

        return r;
    },

    async createTopic(request: CreateTopicRequest): Promise<CreateTopicResponse> {
        // POST "/topics"
        const response = await appConfig.fetch(`${appConfig.restBasePath}/topics`, {
            method: 'POST',
            headers: [
                ['Content-Type', 'application/json']
            ],
            body: JSON.stringify(request),
        });
        return parseOrUnwrap<CreateTopicResponse>(response, null);
    },

    async createACL(request: CreateACLRequest): Promise<void> {
        const response = await appConfig.fetch(`${appConfig.restBasePath}/acls`, {
            method: 'POST',
            headers: [
                ['Content-Type', 'application/json']
            ],
            body: JSON.stringify(request),
        });

        return parseOrUnwrap<void>(response, null);
    },

    async deleteACLs(request: DeleteACLsRequest): Promise<void> {
        const response = await appConfig.fetch(`${appConfig.restBasePath}/acls`, {
            method: 'DELETE',
            headers: [
                ['Content-Type', 'application/json']
            ],
            body: JSON.stringify(request),
        });

        return parseOrUnwrap<void>(response, null);
    },

    async refreshServiceAccounts(force?: boolean): Promise<void> {
        await cachedApiRequest<GetUsersResponse | null>(`${appConfig.restBasePath}/users`, force)
            .then(v => this.serviceAccounts = v ?? null, addError);
    },

    async createServiceAccount(request: CreateUserRequest): Promise<void> {
        const response = await appConfig.fetch(`${appConfig.restBasePath}/users`, {
            method: 'POST',
            headers: [
                ['Content-Type', 'application/json']
            ],
            body: JSON.stringify(request),
        });

        return parseOrUnwrap<void>(response, null);
    },

    async deleteServiceAccount(principalId: string): Promise<void> {
        const response = await appConfig.fetch(`${appConfig.restBasePath}/users/${encodeURIComponent(principalId)}`, {
            method: 'DELETE',
        });

        return parseOrUnwrap<void>(response, null);
    },

    async createSecret(clusterName: string, connectorName: string, secretValue: string): Promise<CreateSecretResponse> {
        const response = await appConfig.fetch(`${appConfig.restBasePath}/kafka-connect/clusters/${encodeURIComponent(clusterName)}/secrets`, {
            method: 'POST',
            headers: [
                ['Content-Type', 'application/json']
            ],
            body: JSON.stringify({
                connectorName,
                clusterName,
                secretData: secretValue,
                labels: {
                    component: 'connectors'
                }
            }),
        });
        return parseOrUnwrap<any>(response, null);
    },

    async updateSecret(clusterName: string, secretId: string, secretValue: string): Promise<void> {
        const response = await appConfig.fetch(`${appConfig.restBasePath}/kafka-connect/clusters/${encodeURIComponent(clusterName)}/secrets/${encodeURIComponent(secretId)}`, {
            method: 'PUT',
            headers: [
                ['Content-Type', 'application/json']
            ],
            body: JSON.stringify({
                secretData: secretValue
            }),
        });
        return parseOrUnwrap<any>(response, null);
    },


    async deleteSecret(clusterName: string, secretId: string): Promise<void> {
        const response = await appConfig.fetch(`${appConfig.restBasePath}/kafka-connect/clusters/${encodeURIComponent(clusterName)}/secrets/${encodeURIComponent(secretId)}`, {
            method: 'DELETE',
        });
        return parseOrUnwrap<void>(response, null);
    },

};

function addFrontendFieldsForConnectCluster(cluster: ClusterConnectors) {
    const allowedActions = cluster.allowedActions ?? ['all'];
    const allowAll = allowedActions.includes('all');

    cluster.canViewCluster = allowAll || allowedActions.includes('viewConnectCluster');
    cluster.canEditCluster = allowAll || allowedActions.includes('editConnectCluster');
    cluster.canDeleteCluster = allowAll || allowedActions.includes('deleteConnectCluster');

    for (const connector of cluster.connectors)
        if (connector.config)
            connector.jsonConfig = JSON.stringify(connector.config, undefined, 4);
        else
            connector.jsonConfig = '';
}

function addFrontendFieldsForConsumerGroup(g: GroupDescription) {
    g.lagSum = g.topicOffsets.sum(o => o.summedLag);

    if (g.allowedActions) {
        if (g.allowedActions.includes('all')) {
            // All perms
        } else {
            // Not all perms, set helper props
            g.noEditPerms = !g.allowedActions?.includes('editConsumerGroup');
            g.noDeletePerms = !g.allowedActions?.includes('deleteConsumerGroup');
        }
    }
    g.isInUse = g.state.toLowerCase() != 'empty';
}

export const brokerMap = computed(() => {
    const brokers = api.clusterInfo?.brokers;
    if (brokers == null) return null;

    const map = new Map<number, Broker>();
    for (const b of brokers)
        map.set(b.brokerId, b);

    return map;
}, { name: 'brokerMap', equals: comparer.structural });


// 1. add 'type' to each synonym, so when expanding a config entry (to view its synonyms), we can still see the type
// 2. remove redundant synonym entries (those that have the same source as the root config entry)
function prepareSynonyms(configEntries: ConfigEntry[]) {
    if (!Array.isArray(configEntries)) return;

    for (const e of configEntries) {
        if (e.synonyms == undefined)
            continue;

        // remove redundant entry
        if (e.synonyms.length > 0)
            if (e.synonyms[0].source == e.source)
                e.synonyms.splice(0, 1);

        if (e.synonyms.length == 0) {
            // delete empty arrays, otherwise Tables will show this entry as 'expandable' even though it has no children
            delete e.synonyms;
            continue;
        }

        // add 'type' from root object
        for (const s of e.synonyms)
            s.type = e.type;
    }
}

function normalizeAcls(acls: AclResource[]) {
    function upperFirst(str: string): string {
        if (!str) return str;
        const lower = str.toLowerCase();
        const first = lower[0];
        const result = first.toUpperCase() + lower.slice(1);
        return result;
    }

    const specialCaseMap = {
        'TRANSACTIONAL_ID': 'TransactionalID'
    } as { [key: string]: string; };

    function normalizeStringEnum<T extends string>(str: T): T {
        if (!str)
            return str;
        if (specialCaseMap[str])
            return specialCaseMap[str] as T;

        const parts = str.split('_');
        for (let i = 0; i < parts.length; i++) {
            parts[i] = upperFirst(parts[i].toLowerCase());
        }
        const result = parts.join('');
        return result as T;
    }

    for (const e of acls) {
        e.resourceType = normalizeStringEnum(e.resourceType);
        e.resourcePatternType = normalizeStringEnum(e.resourcePatternType);

        for (const acl of e.acls) {
            acl.operation = normalizeStringEnum(acl.operation);
            acl.permissionType = normalizeStringEnum(acl.permissionType);
        }
    }
}

export function aclRequestToQuery(request: GetAclsRequest): string {
    const filters = ObjToKv(request)
        .filter(kv => !!kv.value)
        .map(x => [x.key, x.value]);

    const searchParams = new URLSearchParams(filters);
    return searchParams.toString();
}

export async function partialTopicConfigs(configKeys: string[], topics?: string[]): Promise<PartialTopicConfigsResponse> {
    const keys = configKeys.map(k => encodeURIComponent(k)).join(',');
    const topicNames = topics?.map(t => encodeURIComponent(t)).join(',');
    const query = topicNames
        ? `topicNames=${topicNames}&configKeys=${keys}`
        : `configKeys=${keys}`;

    const response = await appConfig.fetch(`${appConfig.restBasePath}/topics-configs?${query}`);
    return parseOrUnwrap<PartialTopicConfigsResponse>(response, null);
}

export interface MessageSearchRequest {
    topicName: string,
    startOffset: number,
    partitionId: number,
    maxResults: number, // should also support '-1' soon, so we can do live tailing
    filterInterpreterCode: string, // js code, base64 encoded
    enterprise?: {
        redpandaCloud?: {
            accessToken: string;
        }
    }
}

async function parseOrUnwrap<T>(response: Response, text: string | null): Promise<T> {
    let obj: undefined | any = undefined;
    if (text === null) {
        if (response.bodyUsed)
            throw new Error('response content already consumed');
        text = await response.text();
    }
    try {
        obj = JSON.parse(text);
    } catch { }

    // api error?
    if (isApiError(obj))
        throw new WrappedApiError(response, obj);

    // server/proxy error?
    if (!response.ok) {
        text = text?.trim() ?? '';
        throw new Error(`${response.status} (${text ?? response.statusText})`);
    }

    return obj as T;
}

function addError(err: Error) {
    api.errors.push(err);
}


type apiStoreType = typeof apiStore;
export const api = observable(apiStore, { messages: observable.shallow }) as apiStoreType;
