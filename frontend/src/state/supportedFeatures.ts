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


//
// We know what features the cluster supports by calling './api/console/endpoints'.
// That only tells us the actual routes we can use though.
// This file translates supported routes to specific frontend features.
// That way we can easily check if (for example) "partition reassignment" should be visible/allowed.
//

import { computed, observable, when } from 'mobx';
import { clone } from '../utils/jsonUtils';
import { api } from './backendApi';

export interface FeatureEntry {
    endpoint: string;
    method: string;
}

export class Feature {
    static readonly ClusterConfig: FeatureEntry = { endpoint: '/api/cluster/config', method: 'GET' };
    static readonly ConsumerGroups: FeatureEntry = { endpoint: '/api/consumer-groups', method: 'GET' };
    static readonly GetReassignments: FeatureEntry = { endpoint: '/api/operations/reassign-partitions', method: 'GET' };
    static readonly PatchReassignments: FeatureEntry = { endpoint: '/api/operations/reassign-partitions', method: 'PATCH' };
    static readonly PatchGroup: FeatureEntry = { endpoint: '/api/consumer-groups/{groupId}', method: 'PATCH' };
    static readonly DeleteGroup: FeatureEntry = { endpoint: '/api/consumer-groups/{groupId}', method: 'DELETE' };
    static readonly DeleteRecords: FeatureEntry = { endpoint: '/api/topics/{topicName}/records', method: 'DELETE' };
    static readonly GetQuotas: FeatureEntry = { endpoint: '/api/quotas', method: 'GET' };
}

// As soon as the supported endpoints are available we should check if
// the backend has returned a feature that we don't know of yet.
setImmediate(() => {
    when(() => api.endpointCompatibility != null, () => {
        if (!api.endpointCompatibility) return;
        // Copy features, then remove the ones we know, report any leftover features.
        const features = clone(api.endpointCompatibility.endpoints);
        const removeMatch = (f: FeatureEntry) => features.removeAll(x => x.method == f.method && x.endpoint == f.endpoint);

        removeMatch(Feature.ClusterConfig);
        removeMatch(Feature.ConsumerGroups);
        removeMatch(Feature.GetReassignments);
        removeMatch(Feature.PatchReassignments);
        removeMatch(Feature.PatchGroup);
        removeMatch(Feature.DeleteGroup);
        removeMatch(Feature.DeleteRecords);
        removeMatch(Feature.GetQuotas)

        if (features.length > 0) {
            const names = features.map(f => `"${f.method} ${f.endpoint}"\n`).join('');
            console.warn('Backend reported new/unknown endpoints for endpointCompatibility:\n' + names);
        }
    });
});

export function isSupported(f: FeatureEntry): boolean {
    const c = api.endpointCompatibility;
    if (!c) return true; // not yet checked, allow it by default...

    for (const e of c.endpoints)
        if (e.method == f.method)
            if (e.endpoint == f.endpoint)
                return e.isSupported;

    featureErrors.push(`Unable to check if feature "${f.method} ${f.endpoint}" is supported because the backend did not return any information about it.`);
    return false;
}

class SupportedFeatures {
    @computed get clusterConfig(): boolean { return isSupported(Feature.ClusterConfig); }
    @computed get consumerGroups(): boolean { return isSupported(Feature.ConsumerGroups); }
    @computed get getReassignments(): boolean { return isSupported(Feature.GetReassignments); }
    @computed get patchReassignments(): boolean { return isSupported(Feature.PatchReassignments); }
    @computed get patchGroup(): boolean { return isSupported(Feature.PatchGroup); }
    @computed get deleteGroup(): boolean { return isSupported(Feature.DeleteGroup); }
    @computed get deleteRecords(): boolean { return isSupported(Feature.DeleteRecords); }
    @computed get getQuotas(): boolean { return isSupported(Feature.GetQuotas); }
}

const features = new SupportedFeatures();
const featureErrors: string[] = observable([]);
export { features as Features, featureErrors };
