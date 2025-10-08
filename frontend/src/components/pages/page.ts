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

import { makeAutoObservable } from 'mobx';
import React from 'react';

import { type BreadcrumbOptions, uiState } from '../../state/ui-state';

//
// Page Types
//
// biome-ignore lint/complexity/noBannedTypes: Empty object type needed for routes without params
export type NoRouteParams = {};

export type PageProps<TRouteParams = NoRouteParams> = TRouteParams & { matchedPath: string };

export class PageInitHelper {
  constructor() {
    makeAutoObservable(this);
  }
  set title(title: string) {
    uiState.pageTitle = title;
  }
  addBreadcrumb(title: string, to: string, heading?: string, options?: BreadcrumbOptions) {
    uiState.pageBreadcrumbs.push({ title, linkTo: to, heading, options });
  }
}
export abstract class PageComponent<TRouteParams = NoRouteParams> extends React.Component<PageProps<TRouteParams>> {
  constructor(props: Readonly<PageProps<TRouteParams>>) {
    super(props);

    uiState.pageBreadcrumbs = [];

    this.initPage(new PageInitHelper());
  }

  abstract initPage(p: PageInitHelper): void;
}
export type PageComponentType<TRouteParams = NoRouteParams> = new (
  props: PageProps<TRouteParams>
) => PageComponent<TRouteParams>;
