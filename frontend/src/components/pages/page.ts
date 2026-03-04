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

import {
  useApiStore,
  useKnowledgebaseStore,
  usePipelinesStore,
  useRolesStore,
  useRpcnSecretManagerStore,
  useTransformsStore,
} from '../../state/backend-api';
import { type BreadcrumbOptions, uiState } from '../../state/ui-state';

//
// Page Types
//
// biome-ignore lint/complexity/noBannedTypes: Empty object type needed for routes without params
export type NoRouteParams = {};

export type PageProps<TRouteParams = NoRouteParams> = TRouteParams & { matchedPath: string };

export class PageInitHelper {
  set title(title: string) {
    uiState.pageTitle = title;
  }
  addBreadcrumb(title: string, to: string, heading?: string, options?: BreadcrumbOptions) {
    uiState.pageBreadcrumbs.push({ title, linkTo: to, heading, options });
  }
}
export abstract class PageComponent<TRouteParams = NoRouteParams> extends React.Component<PageProps<TRouteParams>> {
  private _storeUnsubscribers: Array<() => void> = [];

  constructor(props: Readonly<PageProps<TRouteParams>>) {
    super(props);

    uiState.pageBreadcrumbs = [];

    this.initPage(new PageInitHelper());
  }

  componentDidMount() {
    // Subscribe to all Zustand stores that pages read from via api.*, rolesApi.*, etc.
    // Each store change triggers a re-render so pages see fresh data.
    const update = () => this.forceUpdate();
    this._storeUnsubscribers = [
      useApiStore.subscribe(update),
      useRolesStore.subscribe(update),
      usePipelinesStore.subscribe(update),
      useKnowledgebaseStore.subscribe(update),
      useRpcnSecretManagerStore.subscribe(update),
      useTransformsStore.subscribe(update),
    ];
  }

  componentWillUnmount() {
    for (const unsub of this._storeUnsubscribers) {
      unsub();
    }
    this._storeUnsubscribers = [];
  }

  abstract initPage(p: PageInitHelper): void;
}
export type PageComponentType<TRouteParams = NoRouteParams> = new (
  props: PageProps<TRouteParams>
) => PageComponent<TRouteParams>;
