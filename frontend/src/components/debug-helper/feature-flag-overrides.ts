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
  applyOverrides();
}

export function clearOverrides(): void {
  writeOverrides({});
  applyOverrides();
}

/**
 * Mutate `config.featureFlags` so `isFeatureFlagEnabled()` reflects the
 * overrides stored in localStorage. Most components only read flags during
 * render, so a reload is still recommended after a toggle.
 */
export function applyOverrides(): void {
  const overrides = getOverrides();
  const base: Record<FeatureFlagKey, boolean> = { ...FEATURE_FLAGS };
  for (const k of Object.keys(overrides) as FeatureFlagKey[]) {
    const v = overrides[k];
    if (typeof v === 'boolean') {
      base[k] = v;
    }
  }
  config.featureFlags = base;
}

export function getEffectiveFlags(): Record<FeatureFlagKey, boolean> {
  const overrides = getOverrides();
  const result = { ...FEATURE_FLAGS } as Record<FeatureFlagKey, boolean>;
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
