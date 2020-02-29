

import queryString, { ParseOptions, StringifyOptions, ParsedQuery } from 'query-string';

import { appGlobal } from '../state/appGlobal';

const parseOptions: ParseOptions = {
    arrayFormat: 'comma',
    parseBooleans: true,
    parseNumbers: true,
};
const stringifyOptions: StringifyOptions = {
    strict: false,
    encode: true,
    arrayFormat: 'comma',
    sort: false,
};

export const queryToObj = (str: string) => queryString.parse(str, parseOptions);
export const objToQuery = (obj: { [key: string]: any; }) => '?' + queryString.stringify(obj, stringifyOptions);


// edit the current search query,
// IFF you make any changes inside editFunction, it returns the stringified version of the search query
export function editQuery(editFunction: (queryObject: ParsedQuery<string | number>) => void) {
    const urlParams = queryString.parse(window.location.search);
    editFunction(urlParams);
    const query = queryString.stringify(urlParams);
    const search = '?' + query;

    if (window.location.search != search) {
        //console.log(`changing search: (${window.location.search}) -> (${search})`);
        appGlobal.history.location.search = search;
        appGlobal.history.replace(appGlobal.history.location);
    }
}

