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

import { Reaction } from 'mobx';
import React from 'react';

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
  // biome-ignore lint/style/useNamingConvention: internal MobX bridge field
  private __mobxReaction: Reaction | null = null;

  constructor(props: Readonly<PageProps<TRouteParams>>) {
    super(props);

    uiState.pageBreadcrumbs = [];

    this.initPage(new PageInitHelper());

    // Bridge MobX api.* observables → React re-renders.
    // Pages read from api.* (a MobX observable object) in their render methods.
    // This reaction wraps each render call, tracks the observables accessed,
    // and calls forceUpdate() when any of them change (e.g. async data arrives).
    const reaction = new Reaction(`${this.constructor.name}.render`, () => {
      this.forceUpdate();
    });
    this.__mobxReaction = reaction;

    // biome-ignore lint/suspicious/noExplicitAny: patching instance render for MobX→React bridge
    const originalRender: () => React.ReactNode = (this as any).render.bind(this);
    // biome-ignore lint/suspicious/noExplicitAny: patching instance render for MobX→React bridge
    (this as any).render = () => {
      let result: React.ReactNode;
      reaction.track(() => {
        result = originalRender();
      });
      return result;
    };
  }

  componentWillUnmount() {
    this.__mobxReaction?.dispose();
    this.__mobxReaction = null;
  }

  abstract initPage(p: PageInitHelper): void;
}
export type PageComponentType<TRouteParams = NoRouteParams> = new (
  props: PageProps<TRouteParams>
) => PageComponent<TRouteParams>;
