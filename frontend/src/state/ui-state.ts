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
import type React from 'react';
import { create } from 'zustand';

import { api } from './backend-api';
import { createTopicDetailsSettings, type TopicDetailsSettings as TopicSettings, useUISettingsStore } from './ui';

// Minimal route definition type for currentRoute tracking (legacy, may be removed)
type RouteInfo = {
  title: string;
  path: string;
  icon?: (props: React.ComponentProps<'svg'>) => JSX.Element;
} | null;

export type BreadcrumbOptions = {
  canBeTruncated?: boolean;
  canBeCopied?: boolean;
};

export type BreadcrumbEntry = {
  title: string;
  heading?: string;
  linkTo: string;
  options?: BreadcrumbOptions;
};

export type ServerVersionInfo = {
  ts?: string; // build timestamp, unix seconds
  sha?: string;
  branch?: string;
  shaBusiness?: string;
  branchBusiness?: string;
};

type UIStateStore = {
  // Core state
  _pageTitle: string | React.ReactElement;
  pageBreadcrumbs: BreadcrumbEntry[];
  shouldHidePageHeader: boolean;
  currentRoute: RouteInfo;
  pathName: string;
  _currentTopicName: string | undefined;
  loginError: string | null;
  isUsingDebugUserLogin: boolean;
  serverBuildTimestamp: number | undefined;
  remoteMcpDetails: {
    logsQuickSearch: string;
    sorting: SortingState;
  };

  // Computed getters (accessed as properties on the store)
  get pageTitle(): string | React.ReactElement;
  get selectedClusterName(): string | null;
  get selectedMenuKeys(): string[] | undefined;
  get currentTopicName(): string | undefined;
  get topicSettings(): TopicSettings;

  // Actions (setters)
  setPageTitle: (title: string | React.ReactElement) => void;
  setPageBreadcrumbs: (breadcrumbs: BreadcrumbEntry[]) => void;
  setShouldHidePageHeader: (hide: boolean) => void;
  setCurrentRoute: (route: RouteInfo) => void;
  setPathName: (path: string) => void;
  setCurrentTopicName: (topicName: string | undefined) => void;
  setLoginError: (error: string | null) => void;
  setIsUsingDebugUserLogin: (isUsing: boolean) => void;
  setServerBuildTimestamp: (timestamp: number | undefined) => void;
  setRemoteMcpDetails: (details: { logsQuickSearch?: string; sorting?: SortingState }) => void;
};

export const useUIStateStore = create<UIStateStore>((set, get) => ({
  // Initial state
  _pageTitle: ' ',
  pageBreadcrumbs: [],
  shouldHidePageHeader: false,
  currentRoute: null,
  pathName: '',
  _currentTopicName: undefined,
  loginError: null,
  isUsingDebugUserLogin: false,
  serverBuildTimestamp: undefined,
  remoteMcpDetails: {
    logsQuickSearch: '',
    sorting: [],
  },

  // Computed getters
  get pageTitle() {
    return get()._pageTitle;
  },

  get selectedClusterName() {
    const uiSettings = useUISettingsStore.getState();
    if (uiSettings.selectedClusterIndex in api.clusters) {
      return api.clusters[uiSettings.selectedClusterIndex];
    }
    return null;
  },

  get selectedMenuKeys() {
    let path = get().pathName;

    const i = path.indexOf('/', 1);
    if (i > -1) {
      path = path.slice(0, i);
    }

    return [path];
  },

  get currentTopicName() {
    return get()._currentTopicName;
  },

  get topicSettings() {
    const n = get()._currentTopicName;
    if (!n) {
      return createTopicDetailsSettings('');
    }

    const uiSettings = useUISettingsStore.getState();
    const topicSettings = uiSettings.perTopicSettings.find((t) => t.topicName === n);
    if (topicSettings) {
      return topicSettings;
    }

    throw new Error('reaction for "currentTopicName" was supposed to create topicDetail settings container');
  },

  // Actions
  setPageTitle: (title: string | React.ReactElement) => {
    set({ _pageTitle: title });
    if (typeof title === 'string') {
      document.title = `${title} - Redpanda Console`;
    } else {
      document.title = 'Redpanda Console';
    }
  },

  setPageBreadcrumbs: (breadcrumbs: BreadcrumbEntry[]) => {
    set({ pageBreadcrumbs: breadcrumbs });
  },

  setShouldHidePageHeader: (hide: boolean) => {
    set({ shouldHidePageHeader: hide });
  },

  setCurrentRoute: (route: RouteInfo) => {
    set({ currentRoute: route });
  },

  setPathName: (path: string) => {
    set({ pathName: path });
  },

  setCurrentTopicName: (topicName: string | undefined) => {
    set({ _currentTopicName: topicName });

    // Side effect: create topic settings if needed
    if (topicName) {
      const uiSettings = useUISettingsStore.getState();
      if (!uiSettings.perTopicSettings.find((s) => s.topicName === topicName)) {
        const topicSettings = createTopicDetailsSettings(topicName);
        useUISettingsStore.getState().updateSettings({
          perTopicSettings: [...uiSettings.perTopicSettings, topicSettings],
        });
      }
    }
  },

  setLoginError: (error: string | null) => {
    set({ loginError: error });
  },

  setIsUsingDebugUserLogin: (isUsing: boolean) => {
    set({ isUsingDebugUserLogin: isUsing });
  },

  setServerBuildTimestamp: (timestamp: number | undefined) => {
    set({ serverBuildTimestamp: timestamp });
  },

  setRemoteMcpDetails: (details: { logsQuickSearch?: string; sorting?: SortingState }) => {
    set((state) => ({
      remoteMcpDetails: {
        ...state.remoteMcpDetails,
        ...details,
      },
    }));
  },
}));

// Legacy export with Proxy for backward compatibility
// This allows existing code to access and set properties directly like: uiState.loginError = null
export const uiState = new Proxy(
  {} as {
    pageTitle: string | React.ReactElement;
    pageBreadcrumbs: BreadcrumbEntry[];
    shouldHidePageHeader: boolean;
    selectedClusterName: string | null;
    currentRoute: RouteInfo;
    pathName: string;
    selectedMenuKeys: string[] | undefined;
    currentTopicName: string | undefined;
    topicSettings: TopicSettings;
    loginError: string | null;
    isUsingDebugUserLogin: boolean;
    serverBuildTimestamp: number | undefined;
    remoteMcpDetails: {
      logsQuickSearch: string;
      sorting: SortingState;
    };
  },
  {
    get(_target, prop: string) {
      const store = useUIStateStore.getState();

      // Handle computed properties
      if (prop === 'pageTitle') return store.pageTitle;
      if (prop === 'selectedClusterName') return store.selectedClusterName;
      if (prop === 'selectedMenuKeys') return store.selectedMenuKeys;
      if (prop === 'currentTopicName') return store.currentTopicName;
      if (prop === 'topicSettings') return store.topicSettings;

      // Handle direct properties
      return store[prop as keyof UIStateStore];
    },
    set(_target, prop: string, value: unknown) {
      const store = useUIStateStore.getState();

      // Handle properties with special setters
      if (prop === 'pageTitle') {
        store.setPageTitle(value as string | React.ReactElement);
        return true;
      }
      if (prop === 'pageBreadcrumbs') {
        store.setPageBreadcrumbs(value as BreadcrumbEntry[]);
        return true;
      }
      if (prop === 'shouldHidePageHeader') {
        store.setShouldHidePageHeader(value as boolean);
        return true;
      }
      if (prop === 'currentRoute') {
        store.setCurrentRoute(value as RouteInfo);
        return true;
      }
      if (prop === 'pathName') {
        store.setPathName(value as string);
        return true;
      }
      if (prop === 'currentTopicName') {
        store.setCurrentTopicName(value as string | undefined);
        return true;
      }
      if (prop === 'loginError') {
        store.setLoginError(value as string | null);
        return true;
      }
      if (prop === 'isUsingDebugUserLogin') {
        store.setIsUsingDebugUserLogin(value as boolean);
        return true;
      }
      if (prop === 'serverBuildTimestamp') {
        store.setServerBuildTimestamp(value as number | undefined);
        return true;
      }
      if (prop === 'remoteMcpDetails') {
        store.setRemoteMcpDetails(value as { logsQuickSearch?: string; sorting?: SortingState });
        return true;
      }

      return true;
    },
  }
);
