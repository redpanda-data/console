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

import { type ComponentType, createElement } from 'react';

import { type NoRouteParams, PageComponent, type PageInitHelper, type PageProps } from './page';

/** A legacy page shell that owns subscriptions and delegates rendering to a component. */
export function pageWithContent<TRouteParams = NoRouteParams>(
  Content: ComponentType<PageProps<TRouteParams>>,
  configurePage?: (helper: PageInitHelper, props: PageProps<TRouteParams>) => void
) {
  return class ContentPage extends PageComponent<TRouteParams> {
    initPage(helper: PageInitHelper) {
      configurePage?.(helper, this.props);
    }

    render() {
      return createElement(Content, this.props);
    }
  };
}
