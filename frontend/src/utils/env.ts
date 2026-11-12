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

import { toJson } from './json-utils';
import { removeStringPrefix, removeStringSuffix } from './string-utils';

const env = {
  NODE_ENV: process.env.NODE_ENV ?? '',
  REACT_APP_CONSOLE_GIT_SHA: process.env.REACT_APP_CONSOLE_GIT_SHA ?? '',
  REACT_APP_CONSOLE_GIT_REF: process.env.REACT_APP_CONSOLE_GIT_REF ?? '',
  REACT_APP_BUILD_TIMESTAMP: process.env.REACT_APP_BUILD_TIMESTAMP ?? '',
  REACT_APP_CONSOLE_PLATFORM_VERSION: process.env.REACT_APP_CONSOLE_PLATFORM_VERSION ?? '',
  REACT_APP_BUILT_FROM_PUSH: process.env.REACT_APP_BUILT_FROM_PUSH ?? '',
  REACT_APP_DEV_HINT: process.env.REACT_APP_DEV_HINT ?? '',
  REACT_APP_ENABLED_FEATURES: process.env.REACT_APP_ENABLED_FEATURES ?? '',
};

export { env };

//
// Helpers
const isDev = env.NODE_ENV.length === 0 || env.NODE_ENV === 'development' || env.REACT_APP_DEV_HINT.length > 0;
export const IsProd = !isDev;
export const IsDev = isDev;
export const IsCI = env.REACT_APP_BUILT_FROM_PUSH.length > 0 && env.REACT_APP_BUILT_FROM_PUSH !== 'false';
export type AppFeature = 'SINGLE_SIGN_ON' | 'REASSIGN_PARTITIONS' | 'SHADOW_LINKS' | 'REDPANDA_SQL';
declare global {
  // biome-ignore lint/style/useConsistentTypeDefinitions: Window augmentation must merge with the DOM declaration.
  interface Window {
    BASE_URL?: string;
    ENABLED_FEATURES?: string;
  }
}
if (env.REACT_APP_ENABLED_FEATURES.length > 0) {
  window.ENABLED_FEATURES = env.REACT_APP_ENABLED_FEATURES;
}
const enabledFeatures = new Set((window.ENABLED_FEATURES ?? '').split(','));
export const AppFeatures: Record<AppFeature, boolean> = {
  SINGLE_SIGN_ON: enabledFeatures.has('SINGLE_SIGN_ON'),
  REASSIGN_PARTITIONS: enabledFeatures.has('REASSIGN_PARTITIONS'),
  SHADOW_LINKS: enabledFeatures.has('SHADOW_LINKS'),
  REDPANDA_SQL: enabledFeatures.has('REDPANDA_SQL'),
};
const basePathRaw = window.BASE_URL ?? '';
const basePath = typeof basePathRaw === 'string' && !basePathRaw.startsWith('__BASE_PATH') ? basePathRaw : '';
const basePathTrimmed = basePath ? removeStringPrefix(removeStringSuffix(basePath, '/'), '/') : '';
const basePathS = basePathTrimmed ? `/${basePathTrimmed}` : '';

export function getBasePath() {
  return basePathS;
}

export function getBuildDate(): Date | undefined {
  const timestamp = +env.REACT_APP_BUILD_TIMESTAMP;
  if (timestamp === 0) {
    return;
  }
  return new Date(timestamp * 1000);
}

//
// Print all env vars to console
const envVarDebugObj: Record<string, string> = {};
const envVarDebugAr: {
  name: string;
  value: string;
}[] = [];
const addProp = (key: string, value: unknown) => {
  if (value === undefined || value === null || value === '') {
    return;
  }
  const cleanedKey = removeStringPrefix(removeStringPrefix(key, 'REACT_APP_CONSOLE_'), 'REACT_APP_');
  envVarDebugObj[cleanedKey] = String(value);
  envVarDebugAr.push({ name: cleanedKey, value: String(value) });
};
// - add env vars
for (const [key, value] of Object.entries(env)) {
  addProp(key, value);
}

// - print
// Skip the banner during tests so test output stays clean. The value is
// still exported below for any code that wants to introspect env at runtime.
if (env.NODE_ENV !== 'test') {
  // biome-ignore lint/suspicious/noConsole: intentional console usage
  console.log(toJson(envVarDebugObj));
}

export { envVarDebugAr, envVarDebugObj };
