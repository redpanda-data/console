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

import type React from 'react';
import { create } from 'zustand';

import { type TopicDetailsSettings as TopicSettings, useUISettingsStore } from './ui';
import { createTopicDetailsSettings } from '../types/topic-settings';
import { boundedAppend } from '../utils/bounded-array';

/**
 * Cap on retained per-topic settings. The array grows by one entry per distinct topic ever
 * visited and is persisted (as a full blob) by the settings store, so a session that browses
 * many topics would grow heap and storage without bound. Oldest-added entries drop first (FIFO;
 * re-visits don't refresh position). The persisted zustand store has its own cap in
 * stores/topic-settings-store.ts.
 */
const MAX_PER_TOPIC_SETTINGS = 200;

export type BreadcrumbOptions = {
  canBeTruncated?: boolean;
  canBeCopied?: boolean;
};

export type BreadcrumbEntry = {
  title: string;
  titleNode?: React.ReactNode;
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

export type BackLink = {
  title: string;
  linkTo: string;
};

type UIStateStore = {
  // Core state
  _pageTitle: string | React.ReactElement;
  pageBreadcrumbs: BreadcrumbEntry[];
  backLink: BackLink | null;
  shouldHidePageHeader: boolean;
  pathName: string;
  _currentTopicName: string | undefined;
  loginError: string | null;
  isUsingDebugUserLogin: boolean;
  serverBuildTimestamp: number | undefined;

  // Computed getters (accessed as properties on the store)
  get pageTitle(): string | React.ReactElement;
  get selectedClusterName(): string | null;
  get currentTopicName(): string | undefined;
  get topicSettings(): TopicSettings;

  // Actions (setters)
  setPageTitle: (title: string | React.ReactElement) => void;
  setPageBreadcrumbs: (breadcrumbs: BreadcrumbEntry[]) => void;
  setPageState: (
    title: string | React.ReactElement,
    breadcrumbs: BreadcrumbEntry[],
    backLink?: BackLink | null
  ) => void;
  setBackLink: (backLink: BackLink | null) => void;
  setShouldHidePageHeader: (hide: boolean) => void;
  setPathName: (path: string) => void;
  setCurrentTopicName: (topicName: string | undefined) => void;
  setLoginError: (error: string | null) => void;
  setIsUsingDebugUserLogin: (isUsing: boolean) => void;
  setServerBuildTimestamp: (timestamp: number | undefined) => void;
};

let readClusterNames: () => readonly string[] = () => [];

export const useUIStateStore = create<UIStateStore>((set, get) => ({
  // Initial state
  _pageTitle: ' ',
  pageBreadcrumbs: [],
  backLink: null,
  shouldHidePageHeader: false,
  pathName: '',
  _currentTopicName: undefined,
  loginError: null,
  isUsingDebugUserLogin: false,
  serverBuildTimestamp: undefined,

  // Computed getters
  get pageTitle() {
    return get()._pageTitle;
  },

  get selectedClusterName() {
    try {
      const uiSettings = useUISettingsStore.getState();
      const clusters = readClusterNames();
      if (uiSettings.selectedClusterIndex in clusters) {
        return clusters[uiSettings.selectedClusterIndex];
      }
      return null;
    } catch {
      // In test environments, useUISettingsStore might not be properly initialized
      return null;
    }
  },

  get currentTopicName() {
    return get()._currentTopicName;
  },

  get topicSettings() {
    try {
      const n = get()._currentTopicName;
      if (!(n !== null && n !== undefined && n !== '')) {
        return createTopicDetailsSettings('');
      }

      const uiSettings = useUISettingsStore.getState();
      const topicSettings = uiSettings.perTopicSettings.find((t) => t.topicName === n);
      if (topicSettings) {
        return topicSettings;
      }

      throw new Error('reaction for "currentTopicName" was supposed to create topicDetail settings container');
    } catch {
      // In test environments, stores might not be properly initialized
      // Return a minimal default to avoid breaking tests
      return createTopicDetailsSettings('');
    }
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

  setPageState: (title: string | React.ReactElement, breadcrumbs: BreadcrumbEntry[], backLink?: BackLink | null) => {
    if (typeof title === 'string') {
      document.title = `${title} - Redpanda Console`;
    } else {
      document.title = 'Redpanda Console';
    }
    set({ _pageTitle: title, pageBreadcrumbs: breadcrumbs, backLink: backLink ?? null });
  },

  setBackLink: (backLink: BackLink | null) => {
    set({ backLink });
  },

  setShouldHidePageHeader: (hide: boolean) => {
    set({ shouldHidePageHeader: hide });
  },

  setPathName: (path: string) => {
    set({ pathName: path });
  },

  setCurrentTopicName: (topicName: string | undefined) => {
    set({ _currentTopicName: topicName });

    // Side effect: create topic settings if needed
    if (topicName !== null && topicName !== undefined && topicName !== '') {
      const uiSettings = useUISettingsStore.getState();
      if (uiSettings.perTopicSettings.every((s) => s.topicName !== topicName)) {
        const topicSettings = createTopicDetailsSettings(topicName);
        useUISettingsStore.getState().updateSettings({
          perTopicSettings: boundedAppend(uiSettings.perTopicSettings, topicSettings, MAX_PER_TOPIC_SETTINGS),
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
}));

// Legacy export with Proxy for backward compatibility
// This allows existing code to access and set properties directly like: uiState.loginError = null

// Prototype accessors preserve the legacy non-enumerable view while keeping writes typed.
class LegacyUIState {
  setClusterNamesSource(read: () => readonly string[]) {
    const previous = readClusterNames;
    readClusterNames = read;
    return () => {
      readClusterNames = previous;
    };
  }

  get pageTitle(): string | React.ReactElement {
    return useUIStateStore.getState().pageTitle;
  }
  set pageTitle(value: string | React.ReactElement) {
    useUIStateStore.getState().setPageTitle(value);
  }
  get pageBreadcrumbs(): BreadcrumbEntry[] {
    return useUIStateStore.getState().pageBreadcrumbs;
  }
  set pageBreadcrumbs(value: BreadcrumbEntry[]) {
    useUIStateStore.getState().setPageBreadcrumbs(value);
  }
  get backLink(): BackLink | null {
    return useUIStateStore.getState().backLink;
  }
  set backLink(value: BackLink | null) {
    useUIStateStore.getState().setBackLink(value);
  }
  get shouldHidePageHeader(): boolean {
    return useUIStateStore.getState().shouldHidePageHeader;
  }
  set shouldHidePageHeader(value: boolean) {
    useUIStateStore.getState().setShouldHidePageHeader(value);
  }
  get pathName(): string {
    return useUIStateStore.getState().pathName;
  }
  set pathName(value: string) {
    useUIStateStore.getState().setPathName(value);
  }
  get currentTopicName(): string | undefined {
    return useUIStateStore.getState().currentTopicName;
  }
  set currentTopicName(value: string | undefined) {
    useUIStateStore.getState().setCurrentTopicName(value);
  }
  get loginError(): string | null {
    return useUIStateStore.getState().loginError;
  }
  set loginError(value: string | null) {
    useUIStateStore.getState().setLoginError(value);
  }
  get isUsingDebugUserLogin(): boolean {
    return useUIStateStore.getState().isUsingDebugUserLogin;
  }
  set isUsingDebugUserLogin(value: boolean) {
    useUIStateStore.getState().setIsUsingDebugUserLogin(value);
  }
  get serverBuildTimestamp(): number | undefined {
    return useUIStateStore.getState().serverBuildTimestamp;
  }
  set serverBuildTimestamp(value: number | undefined) {
    useUIStateStore.getState().setServerBuildTimestamp(value);
  }
  get selectedClusterName(): string | null {
    return useUIStateStore.getState().selectedClusterName;
  }
  get topicSettings(): TopicSettings {
    return useUIStateStore.getState().topicSettings;
  }
}

const legacyWritableFields = new Set<string>([
  'pageTitle',
  'pageBreadcrumbs',
  'backLink',
  'shouldHidePageHeader',
  'pathName',
  'currentTopicName',
  'loginError',
  'isUsingDebugUserLogin',
  'serverBuildTimestamp',
]);

export const uiState = new Proxy(new LegacyUIState(), {
  set(target, prop: string | symbol, value: unknown) {
    if (typeof prop === 'string' && legacyWritableFields.has(prop)) {
      return Reflect.set(target, prop, value);
    }
    return true;
  },
});

export function setPageHeader(
  title: string | React.ReactElement,
  breadcrumbs: BreadcrumbEntry[],
  backLink?: BackLink | null
) {
  useUIStateStore.getState().setPageState(title, breadcrumbs, backLink);
}
