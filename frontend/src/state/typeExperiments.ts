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



export {}

// Strong-Typing experiments

/*
{
	type KeysOf<T> = keyof T // prop names
	type TypesOf<T> = T[KeysOf<T>] // prop types
	type PropNamesOfType<T, TargetType> = { [M in (keyof T)]: T[M] extends TargetType ? M : never }[keyof T]
	type PropsOfType<T, TargetType> = Pick<T, PropNamesOfType<T, TargetType>>
	// Omit: Filter T by prop-names
	type RemovePropsByType<T, Excluded> = Omit<T, PropNamesOfType<T, Excluded>> // From T remove props that match Excluded
	type DataPropNames<T> = { [K in keyof T]: T[K] extends Function ? never : K }[keyof T];
	type DataProps<T> = { [K in keyof T]: T[K] extends Function ? never : T[K] };
	type FunctionPropNames<T> = { [K in keyof T]: T[K] extends Function ? K : never }[keyof T]
	type FunctionProps<T> = Pick<T, FunctionPropNames<T>>




	type ApiType = typeof apiStore;
	type ApiDataKeys = DataPropNames<ApiType>

	async function apiUpdate<TKey extends keyof ApiType, TResponse>(url: string, field: TKey) {
		const response: any = await rest<TResponse>(url);
	}

	const RestRoutes = {
		'/topics': GetTopicsResponse,
		'/consumer-groups': GetConsumerGroupsResponse
	}
	const RestRoutes2 = {
		GetTopicsResponse: '/topics',
		GetConsumerGroupsResponse: '/consumer-groups',
	}
	type RoutesType = typeof RestRoutes
	type Paths = KeysOf<RoutesType>
	type Responses = TypesOf<RoutesType>
	type DataOfResp<Route extends Responses> = Unpack<Route>

	// function getByPropName<Key extends ApiDataKeys>(name: Key): ApiType[Key] {
	// 	const paths = Object.getOwnPropertyNames(RestRoutes);
	// 	const path = ;

	// 	return api[name]
	// }


	type Unpack<T> = {
		[K in keyof T]: (T[K])
	}
	type ResponseTypeToPropName<T> = KeysOf<Unpack<T>>		// topics
	type ResponseTypeToPropType<T> = TypesOf<Unpack<T>>		// TopicDetail[]
	type ResponseTypeToProp<T> = Unpack<T>					// topics: TopicDetail[]


	type example = ResponseTypeToPropType<GetTopicsResponse>
	type re = ResponseTypeToPropName<GetTopicsResponse>

	type RouteToDataType<RouteResult extends Responses> = {
		// [K in KeysOf<keyof RouteToResponseType>] : number
	}
	//type DataTypeOf_GetTopicsResponse = RouteToDataType<GetTopicsResponse>

	type RouteToDataType2 = {
		// [K in Unpack<ResponseTypeToPropName<GetTopicsResponse>>] : (ResponseTypeToProp<K>)
		[K in Unpack<ResponseTypeToPropName<GetTopicsResponse>>]: GetTopicsResponse[K]
	}



}

*/
