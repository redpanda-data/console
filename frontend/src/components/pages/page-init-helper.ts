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

import { type BreadcrumbEntry, type BreadcrumbOptions, setPageHeader } from '../../state/ui-state';

export class PageInitHelper {
  private pageTitle = '';
  private pageBreadcrumbs: BreadcrumbEntry[] = [];

  set title(title: string) {
    this.pageTitle = title;
  }
  addBreadcrumb(title: string, to: string, heading?: string, options?: BreadcrumbOptions) {
    this.pageBreadcrumbs.push({ title, linkTo: to, heading, options });
  }
  _flush() {
    setPageHeader(this.pageTitle, this.pageBreadcrumbs);
  }
}
