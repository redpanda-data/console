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
import { uiState } from '../../state/uiState';


//
// Page Types
//
export type PageProps<TRouteParams = Record<string, unknown>> = TRouteParams & { matchedPath: string }

export class PageInitHelper {
    set title(title: string) { uiState.pageTitle = title; }
    addBreadcrumb(title: string, to: string) { uiState.pageBreadcrumbs.push({ title: title, linkTo: to }) }
}
export abstract class PageComponent<TRouteParams = Record<string, unknown>> extends React.Component<PageProps<TRouteParams>> {

    constructor(props: Readonly<PageProps<TRouteParams>>) {
        super(props);

        uiState.pageBreadcrumbs = [];

        this.initPage(new PageInitHelper());
    }

    abstract initPage(p: PageInitHelper): void;
}
export type PageComponentType<TRouteParams = Record<string, unknown>> = (new (props: PageProps<TRouteParams>) => PageComponent<PageProps<TRouteParams>>);


