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

import React from 'react';

import { PageInitHelper } from './page-init-helper';
import {
  api,
  pipelinesApi,
  rpcnSecretManagerApi,
  transformsApi,
  useApiStore,
  usePipelinesStore,
  useRolesStore,
  useRpcnSecretManagerStore,
  useTransformsStore,
} from '../../state/backend-api';

export { PageInitHelper } from './page-init-helper';

// biome-ignore lint/complexity/noBannedTypes: Empty object type needed for routes without params
export type NoRouteParams = {};

export type PageProps<TRouteParams = NoRouteParams> = TRouteParams & { matchedPath: string };

/**
 * Legacy pages initialize in the base constructor, before subclass fields are assigned. Live API facades must be available then. The component subscribes to facade stores after mount.
 */
export abstract class PageComponent<TRouteParams = NoRouteParams> extends React.Component<PageProps<TRouteParams>> {
  private _storeUnsubscribers: Array<() => void> = [];

  constructor(props: Readonly<PageProps<TRouteParams>>) {
    super(props);

    const helper = new PageInitHelper();
    this.initPage(helper);
    helper._flush();
  }

  componentDidMount() {
    const update = () => this.forceUpdate();
    this._storeUnsubscribers = [
      useApiStore.subscribe(update),
      useRolesStore.subscribe(update),
      usePipelinesStore.subscribe(update),
      useRpcnSecretManagerStore.subscribe(update),
      useTransformsStore.subscribe(update),
    ];
    // WARNING: Render once after subscribing; a constructor-started request can settle before mount.
    this.forceUpdate();
  }

  componentWillUnmount() {
    for (const unsub of this._storeUnsubscribers) {
      unsub();
    }
    this._storeUnsubscribers = [];
  }

  protected readonly api = api;
  protected readonly pipelinesApi = pipelinesApi;
  protected readonly rpcnSecretManagerApi = rpcnSecretManagerApi;
  protected readonly transformsApi = transformsApi;
  abstract initPage(p: PageInitHelper): void;
}
export type PageComponentType<TRouteParams = NoRouteParams> = new (
  props: PageProps<TRouteParams>
) => PageComponent<TRouteParams>;
