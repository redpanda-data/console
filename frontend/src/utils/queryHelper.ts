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

import { appGlobal } from '../state/appGlobal';

export const queryToObj = (str: string) => {
    const query = new URLSearchParams(str);
    const obj = {} as Record<string, string>;
    for (const [k, v] of query.entries())
        obj[k] = v;

    return obj;
}
export const objToQuery = (obj: { [key: string]: any; }) => {
    // '?' + queryString.stringify(obj, stringifyOptions)
    const query = new URLSearchParams();
    for (const [k, v] of Object.entries(obj)) {
        if (v === null || v === undefined || v === '')
            continue;

        query.append(k, String(v));
    }
    return '?' + query.toString();
}


// edit the current search query,
// IFF you make any changes inside editFunction, it returns the stringified version of the search query
export function editQuery(editFunction: (queryObject: Record<string, string | null | undefined>) => void) {
    const currentObj = queryToObj(window.location.search);
    editFunction(currentObj);

    const newQuery = objToQuery(currentObj);

    if (window.location.search != newQuery) {
        //console.log(`changing search: (${window.location.search}) -> (${search})`);
        appGlobal.history.location.search = newQuery;
        appGlobal.history.replace(appGlobal.history.location);
    }
}

