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

import type { SortingState } from '@tanstack/react-table';
import { computed, makeObservable, observable } from 'mobx';
import React from 'react';
import type { PageDefinition } from '../components/routes';
import { api } from './backendApi';
import { TopicDetailsSettings as TopicSettings, uiSettings } from './ui';

export interface BreadcrumbOptions {
  canBeTruncated?: boolean;
  canBeCopied?: boolean;
}

export interface BreadcrumbEntry {
  title: string;
  heading?: string;
  linkTo: string;
  options?: BreadcrumbOptions;
}

class UIState {
  constructor() {
    makeObservable(this);
  }

  @observable private _pageTitle: string | React.ReactElement = ' ';
  @computed get pageTitle() {
    return this._pageTitle;
  }
  set pageTitle(title: string | React.ReactElement) {
    this._pageTitle = title;
    if (typeof title === 'string') {
      document.title = `${title} - Redpanda Console`;
    } else {
      document.title = 'Redpanda Console';
    }
  }

  @observable pageBreadcrumbs: BreadcrumbEntry[] = [];

  @computed get selectedClusterName(): string | null {
    if (uiSettings.selectedClusterIndex in api.clusters) return api.clusters[uiSettings.selectedClusterIndex];
    return null;
  }

  @observable currentRoute = null as PageDefinition<any> | null; // will be null when a page fails to render

  @observable pathName: string; // automatically updated from router path
  @computed get selectedMenuKeys(): string[] | undefined {
    // For now path root is perfect
    let path = this.pathName;

    const i = path.indexOf('/', 1);
    if (i > -1) path = path.slice(0, i);

    return [path];
  }

  @observable
  private _currentTopicName: string | undefined;
  public get currentTopicName(): string | undefined {
    return this._currentTopicName;
  }
  public set currentTopicName(topicName: string | undefined) {
    this._currentTopicName = topicName;
    if (topicName) {
      if (!uiSettings.perTopicSettings.any((s) => s.topicName === topicName)) {
        // console.log('creating details for topic: ' + topicName);
        const topicSettings = new TopicSettings();
        topicSettings.topicName = topicName;
        uiSettings.perTopicSettings.push(topicSettings);
      }
    }
  }

  get topicSettings(): TopicSettings {
    const n = this.currentTopicName;
    if (!n) {
      return new TopicSettings();
    }

    const topicSettings = uiSettings.perTopicSettings.find((t) => t.topicName === n);
    if (topicSettings) return topicSettings;

    throw new Error('reaction for "currentTopicName" was supposed to create topicDetail settings container');
  }

  @observable loginError: string | null = null;
  @observable isUsingDebugUserLogin = false;

  // Every response from the backend contains, amongst others, the 'app-sha' header (was previously named 'app-version' which was confusing).
  // If the version doesn't match the current frontend version a promt is shown (like 'new version available, want to reload to update?').
  // If the user declines, updatePromtHiddenUntil is set to prevent the promt from showing up for some time.
  @observable serverBuildTimestamp: number | undefined = undefined;

  @observable remoteMcpDetails = {
    logsQuickSearch: '',
    sorting: [] as SortingState,
  };
}

export interface ServerVersionInfo {
  ts?: string; // build timestamp, unix seconds
  sha?: string;
  branch?: string;
  shaBusiness?: string;
  branchBusiness?: string;
}

const uiState = new UIState();
export { uiState };
