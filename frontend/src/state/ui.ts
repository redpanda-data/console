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

import { create } from 'zustand';
import { persist, subscribeWithSelector } from 'zustand/middleware';

import { decodeUiSettings, defaultUiSettings, type UISettings } from '../types/ui-settings';
import { assignDeep } from '../utils/utils';

export type {
  ColumnList,
  DataColumnKey,
  FilterEntry,
  FilterType,
  PartitionOffsetOriginType,
  PreviewTag,
  PreviewTagV2,
  TimestampDisplayFormat,
  TopicDetailsSettings,
  TopicMessageSearchSettings,
} from '../types/topic-settings';
export type { ConnectTabKeys, ValueDisplay } from '../types/ui-settings';

const settingsName = 'uiSettings-v3';

type UISettingsStore = UISettings & {
  // Actions
  updateSettings: (settings: Partial<UISettings>) => void;
  clearSettings: () => void;
};

// Parsed and upgraded settings, or null when the stored text holds nothing usable.
function loadStoredSettings(str: string) {
  try {
    const loadedSettings = decodeUiSettings(JSON.parse(str));
    if (!loadedSettings) {
      return null;
    }

    return {
      state: loadedSettings,
      version: 3,
    };
  } catch (error) {
    // biome-ignore lint/suspicious/noConsole: intentional console usage
    console.error('Error loading UI settings:', error);
    return null;
  }
}

// Debounced save function
let saveTimeoutId: NodeJS.Timeout | null = null;
const SAVE_DELAY = 2000;

function scheduleSave(state: UISettings) {
  if (saveTimeoutId) {
    clearTimeout(saveTimeoutId);
  }

  saveTimeoutId = setTimeout(() => {
    const json = JSON.stringify(state);
    localStorage.setItem(settingsName, json);
  }, SAVE_DELAY);
}

// Immediate save function (for visibility change)
function saveImmediately(state: UISettings) {
  if (saveTimeoutId) {
    clearTimeout(saveTimeoutId);
    saveTimeoutId = null;
  }
  const json = JSON.stringify(state);
  localStorage.setItem(settingsName, json);
}

// Create the store
export const useUISettingsStore = create<UISettingsStore>()(
  subscribeWithSelector(
    persist(
      (set, get) => ({
        ...structuredClone(defaultUiSettings),

        updateSettings: (settings: Partial<UISettings>) => {
          set((state) => {
            const newState = { ...state };
            assignDeep(newState, settings);
            return newState;
          });
        },

        clearSettings: () => {
          set({
            ...structuredClone(defaultUiSettings),
            updateSettings: get().updateSettings,
            clearSettings: get().clearSettings,
          });
        },
      }),
      {
        name: settingsName,
        version: 3,
        storage: {
          getItem: (name) => {
            const str = localStorage.getItem(name);
            if (!(str !== null && str !== undefined && str !== '')) {
              return null;
            }

            return loadStoredSettings(str);
          },
          setItem: (name, value) => {
            const json = JSON.stringify(value.state);
            localStorage.setItem(name, json);
          },
          removeItem: (name) => {
            localStorage.removeItem(name);
          },
        },
      }
    )
  )
);

/**
 * Installs side-effects for the UI-settings store:
 *   - debounced auto-save on store change
 *   - immediate auto-save on visibility change
 *   - cross-tab settings sync via the `storage` event
 *
 * Returns a teardown function that removes all listeners / subscribers and
 * clears any pending save timer.
 *
 * Installed from `app.tsx` / `embedded-app.tsx` inside a `useEffect` so
 * React owns the lifecycle. No-op when `window` is undefined (SSR and tests
 * isolate resets before happy-dom installs globals).
 */
export function installUISettingsSideEffects(): () => void {
  if (typeof window === 'undefined') {
    return () => {
      // no-op
    };
  }

  const unsubStore = useUISettingsStore.subscribe((state) => {
    const { updateSettings: _, clearSettings: __, ...settingsToSave } = state;
    scheduleSave(settingsToSave);
  });

  const onVisibilityChange = () => {
    if (document.visibilityState === 'visible') {
      return; // only save on close, minimize, tab-switch
    }

    const state = useUISettingsStore.getState();
    const { updateSettings: _, clearSettings: __, ...settingsToSave } = state;
    saveImmediately(settingsToSave);
  };
  window.addEventListener('visibilitychange', onVisibilityChange);

  // When there are multiple tabs open, they are unaware of each other and overwriting each others changes.
  // So we must listen to changes made by other tabs, and when a change is saved we load the updated settings.
  const onStorage = (e: StorageEvent) => {
    if (e.key !== settingsName || e.newValue === null) {
      return;
    }
    try {
      const { updateSettings: _, clearSettings: __, ...currentSettings } = useUISettingsStore.getState();
      const newSettings = decodeUiSettings(JSON.parse(e.newValue), currentSettings);
      if (!newSettings) {
        return;
      }
      // Applying changes here will of course trigger the auto-save, but that's fine.
      // The settings will be serialized to the exact same json again, so no storage events will be triggered by `.setItem()`
      useUISettingsStore.getState().updateSettings(newSettings);
    } catch (error) {
      // biome-ignore lint/suspicious/noConsole: intentional console usage
      console.error('error applying settings update from another tab', { storageEvent: e, error });
    }
  };
  window.addEventListener('storage', onStorage);

  return () => {
    unsubStore();
    window.removeEventListener('visibilitychange', onVisibilityChange);
    window.removeEventListener('storage', onStorage);
    if (saveTimeoutId) {
      clearTimeout(saveTimeoutId);
      saveTimeoutId = null;
    }
  };
}

// Legacy exports for backward compatibility
export const uiSettings = new Proxy<UISettings>(defaultUiSettings, {
  get(_target, prop: string | symbol): unknown {
    return Reflect.get(useUISettingsStore.getState(), prop);
  },
  set(_target, prop: string, value: unknown) {
    useUISettingsStore.getState().updateSettings({ [prop]: value });
    return true;
  },
});

export function clearSettings() {
  useUISettingsStore.getState().clearSettings();
}
