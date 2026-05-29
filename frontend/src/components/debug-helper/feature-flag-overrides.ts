/**
 * Copyright 2026 Redpanda Data, Inc.
 *
 * Use of this software is governed by the Business Source License
 * included in the file https://github.com/redpanda-data/redpanda/blob/dev/licenses/bsl.md
 *
 * As of the Change Date specified in that file, in accordance with
 * the Business Source License, use of this software will be governed
 * by the Apache License, Version 2.0
 */

import { FEATURE_FLAGS } from '../../components/constants';
import { config } from '../../config';
import { IsDev } from '../../utils/env';

export type FeatureFlagKey = keyof typeof FEATURE_FLAGS;

const STORAGE_KEY = '__debug_feature_flag_overrides';

export type FeatureFlagOverrides = Partial<Record<FeatureFlagKey, boolean>>;

export function getOverrides(): FeatureFlagOverrides {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return {};
    }
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === 'object') {
      return parsed as FeatureFlagOverrides;
    }
    return {};
  } catch {
    return {};
  }
}

function writeOverrides(next: FeatureFlagOverrides): void {
  if (Object.keys(next).length === 0) {
    window.localStorage.removeItem(STORAGE_KEY);
  } else {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  }
}

export function setOverride(key: FeatureFlagKey, value: boolean | null): void {
  const current = getOverrides();
  if (value === null) {
    delete current[key];
  } else {
    current[key] = value;
  }
  writeOverrides(current);
  installFeatureFlagAccessor();
}

export function clearOverrides(): void {
  writeOverrides({});
  installFeatureFlagAccessor();
}

export function getEffectiveFlags(): Record<FeatureFlagKey, boolean> {
  const overrides = getOverrides();
  const result = { ...baseFlags } as Record<FeatureFlagKey, boolean>;
  for (const k of Object.keys(overrides) as FeatureFlagKey[]) {
    const v = overrides[k];
    if (typeof v === 'boolean') {
      result[k] = v;
    }
  }
  return result;
}

export function getAllFlagKeys(): FeatureFlagKey[] {
  return Object.keys(FEATURE_FLAGS) as FeatureFlagKey[];
}

let baseFlags: Record<FeatureFlagKey, boolean> = { ...FEATURE_FLAGS };
let accessorInstalled = false;

// Replaces `config.featureFlags` with a getter/setter so reads always overlay
// localStorage overrides. Survives `setConfig()` reassigning the property
// (otherwise overrides get wiped on each App mount / federated host reconfig).
function installFeatureFlagAccessor(): void {
  if (accessorInstalled) {
    return;
  }
  baseFlags = { ...(config.featureFlags ?? FEATURE_FLAGS) } as Record<FeatureFlagKey, boolean>;

  Object.defineProperty(config, 'featureFlags', {
    configurable: true,
    enumerable: true,
    get(): Record<FeatureFlagKey, boolean> {
      const overrides = getOverrides();
      if (Object.keys(overrides).length === 0) {
        return baseFlags;
      }
      const merged = { ...baseFlags };
      for (const k of Object.keys(overrides) as FeatureFlagKey[]) {
        const v = overrides[k];
        if (typeof v === 'boolean') {
          merged[k] = v;
        }
      }
      return merged;
    },
    set(next: Record<FeatureFlagKey, boolean> | undefined): void {
      baseFlags = { ...(next ?? FEATURE_FLAGS) } as Record<FeatureFlagKey, boolean>;
    },
  });
  accessorInstalled = true;
}

export function applyOverrides(): void {
  installFeatureFlagAccessor();
}

// Install at module load so the first `config.featureFlags[key]` read already
// overlays overrides — well before any React render.
if (IsDev && typeof window !== 'undefined') {
  try {
    installFeatureFlagAccessor();
  } catch {
    // localStorage / defineProperty unavailable.
  }
}
