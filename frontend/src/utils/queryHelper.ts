

import queryString, { ParseOptions, StringifyOptions } from 'query-string';

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

/*
	todo:

	// parse query data to object
	- queryToData<TData>(query: string) : TData

	// 1. convert object to query
	// 2. compute full new url
	// 3. set address bar (so they can copy that)
	// 4. if last history entry has same path, replace it (so changing ui settings doesn't spam history state)
	- setQuery(obj: any)
*/